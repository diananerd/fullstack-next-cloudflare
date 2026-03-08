"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { entities } from "@/modules/artworks/schemas/entity.schema";
import { entityRelations } from "@/modules/artworks/schemas/entity-relation.schema";
import { collectionNodes } from "@/modules/artworks/schemas/collection-node.schema";
import { RELATION_TYPES } from "@/constants/relation-types";
import { requireAuth } from "@/modules/auth/utils/auth-utils";

/** Move any entity (artwork or collection) to a new parent collection, or to root (null). */
export async function moveWorkspaceItemAction(
    itemId: string,
    toCollectionId: string | null,
) {
    const user = await requireAuth();
    const db = await getDb();

    const [entity] = await db
        .select({ createdBy: entities.createdBy })
        .from(entities)
        .where(eq(entities.id, itemId))
        .limit(1);

    if (!entity || entity.createdBy !== user.id) {
        return { success: false, error: "Not authorized" };
    }

    // Find existing parent relation
    const [existingRel] = await db
        .select({ fromId: entityRelations.fromId, id: entityRelations.id })
        .from(entityRelations)
        .where(
            and(
                eq(entityRelations.toId, itemId),
                eq(entityRelations.type, RELATION_TYPES.CONTAINS),
            ),
        )
        .limit(1);

    const currentParentId = existingRel?.fromId ?? null;

    // No-op if already in the target
    if (currentParentId === toCollectionId) return { success: true };

    // Decrement old parent itemCount
    if (currentParentId) {
        await db
            .update(collectionNodes)
            .set({ itemCount: sql`max(0, item_count - 1)` })
            .where(eq(collectionNodes.id, currentParentId));
        // Delete old relation
        await db
            .delete(entityRelations)
            .where(
                and(
                    eq(entityRelations.toId, itemId),
                    eq(entityRelations.type, RELATION_TYPES.CONTAINS),
                ),
            );
    }

    // Create new parent relation (if moving into a collection)
    if (toCollectionId) {
        await db.insert(entityRelations).values({
            fromId: toCollectionId,
            toId: itemId,
            type: RELATION_TYPES.CONTAINS,
            createdBy: user.id,
        });
        // Increment new parent itemCount
        await db
            .update(collectionNodes)
            .set({ itemCount: sql`item_count + 1` })
            .where(eq(collectionNodes.id, toCollectionId));
    }

    revalidatePath("/artworks");
    return { success: true };
}

// Legacy compatibility aliases
export async function moveArtworkAction(
    artworkId: string,
    _fromCollectionId: string | null,
    toCollectionId: string | null,
) {
    return moveWorkspaceItemAction(artworkId, toCollectionId);
}

export async function moveCollectionAction(
    collectionId: string,
    toCollectionId: string | null,
) {
    return moveWorkspaceItemAction(collectionId, toCollectionId);
}
