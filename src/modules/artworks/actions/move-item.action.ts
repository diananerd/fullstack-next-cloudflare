"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import {
    CollectionRole,
    PlacementContext,
} from "@/modules/social/models/collection.enum";
import { collectionItems } from "@/modules/social/schemas/collection-item.schema";
import { collectionMembers } from "@/modules/social/schemas/collection-member.schema";
import { collectionPlacements } from "@/modules/social/schemas/collection-placement.schema";
import { collections } from "@/modules/social/schemas/collection.schema";

/** Move an artwork between collections (or root ↔ collection). */
export async function moveArtworkAction(
    artworkId: number,
    fromCollectionId: string | null,
    toCollectionId: string | null,
) {
    if (fromCollectionId === toCollectionId) return { success: true };

    const user = await requireAuth();
    const db = await getDb();

    const [artwork] = await db
        .select({ userId: artworks.userId })
        .from(artworks)
        .where(eq(artworks.id, artworkId))
        .limit(1);

    if (!artwork || artwork.userId !== user.id) {
        return { success: false, error: "Not authorized" };
    }

    if (fromCollectionId) {
        await db
            .delete(collectionItems)
            .where(
                and(
                    eq(collectionItems.collectionId, fromCollectionId),
                    eq(collectionItems.artworkId, artworkId),
                ),
            );
        await db
            .update(collections)
            .set({
                itemCount: sql`max(0, item_count - 1)`,
                updatedAt: new Date().toISOString(),
            })
            .where(eq(collections.id, fromCollectionId));
    }

    if (toCollectionId) {
        const [maxPos] = await db
            .select({ pos: sql<number>`coalesce(max(position), -1)` })
            .from(collectionItems)
            .where(eq(collectionItems.collectionId, toCollectionId));

        await db
            .insert(collectionItems)
            .values({
                collectionId: toCollectionId,
                artworkId,
                position: (maxPos?.pos ?? -1) + 1,
                addedByUserId: user.id,
            })
            .onConflictDoNothing();

        await db
            .update(collections)
            .set({
                itemCount: sql`item_count + 1`,
                updatedAt: new Date().toISOString(),
            })
            .where(eq(collections.id, toCollectionId));
    }

    revalidatePath("/artworks");
    return { success: true };
}

/** Move a collection into another collection, or back to workspace root. */
export async function moveCollectionAction(
    collectionId: string,
    toCollectionId: string | null,
) {
    if (collectionId === toCollectionId) return { success: true };

    const user = await requireAuth();
    const db = await getDb();

    const [member] = await db
        .select({ role: collectionMembers.role })
        .from(collectionMembers)
        .where(
            and(
                eq(collectionMembers.collectionId, collectionId),
                eq(collectionMembers.userId, user.id),
            ),
        )
        .limit(1);

    if (!member || member.role !== CollectionRole.OWNER) {
        return { success: false, error: "Not authorized" };
    }

    // Remove existing WORKSPACE / COLLECTION placements (a collection lives in one place)
    await db
        .delete(collectionPlacements)
        .where(
            and(
                eq(collectionPlacements.collectionId, collectionId),
                inArray(collectionPlacements.contextType, [
                    PlacementContext.WORKSPACE,
                    PlacementContext.COLLECTION,
                ]),
            ),
        );

    // Insert new placement
    await db
        .insert(collectionPlacements)
        .values({
            collectionId,
            contextType: toCollectionId
                ? PlacementContext.COLLECTION
                : PlacementContext.WORKSPACE,
            contextId: toCollectionId ?? user.id,
        })
        .onConflictDoNothing();

    revalidatePath("/artworks");
    return { success: true };
}
