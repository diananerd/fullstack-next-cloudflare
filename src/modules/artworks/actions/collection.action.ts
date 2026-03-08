"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import { nodeRelations } from "@/modules/nodes/schemas/node-relation.schema";
import { collectionNodes } from "@/modules/artworks/schemas/collection-node.schema";
import { RELATION_TYPES } from "@/constants/relation-types";
import { member } from "@/modules/profiles/schemas/org-plugin.schema";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { sql } from "drizzle-orm";
import { parseCollectionTitle } from "@/modules/artworks/utils/collection-title";

async function assertOwner(
    db: Awaited<ReturnType<typeof getDb>>,
    id: string,
    userId: string,
) {
    const [row] = await db
        .select({ id: nodes.id })
        .from(nodes)
        .where(and(eq(nodes.id, id), eq(nodes.createdBy, userId)))
        .limit(1);
    return !!row;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createCollectionAction(
    rawTitle: string,
    parentCollectionId?: string | null,
) {
    const user = await requireAuth();

    const validated = parseCollectionTitle(rawTitle);
    if (!validated.ok)
        return { success: false as const, error: validated.error };

    const db = await getDb();

    const [membership] = await db
        .select({ organizationId: member.organizationId })
        .from(member)
        .where(eq(member.userId, user.id))
        .limit(1);

    const collectionId = crypto.randomUUID();

    await db.insert(nodes).values({
        id: collectionId,
        type: "folder",
        createdBy: user.id,
        visibility: "private",
    });

    await db.insert(collectionNodes).values({
        id: collectionId,
        name: validated.title,
    });

    if (parentCollectionId) {
        await db.insert(nodeRelations).values({
            fromId: parentCollectionId,
            toId: collectionId,
            type: RELATION_TYPES.CONTAINS,
            createdBy: user.id,
        });
        await db
            .update(collectionNodes)
            .set({ itemCount: sql`item_count + 1` })
            .where(eq(collectionNodes.id, parentCollectionId));
    }

    if (membership) {
        await db
            .insert(nodeRelations)
            .values({
                fromId: membership.organizationId,
                toId: collectionId,
                type: RELATION_TYPES.CURATES,
                createdBy: user.id,
            })
            .onConflictDoNothing();
    }

    revalidatePath("/artworks");
    return { success: true as const, collectionId };
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateCollectionAction(
    id: string,
    data: { name?: string; visibility?: "public" | "private" | "unlisted" },
) {
    const user = await requireAuth();
    const db = await getDb();

    if (!(await assertOwner(db, id, user.id)))
        return { success: false as const, error: "Unauthorized" };

    const now = new Date().toISOString();

    if (data.name !== undefined) {
        const validated = parseCollectionTitle(data.name);
        if (!validated.ok)
            return { success: false as const, error: validated.error };
        await db
            .update(collectionNodes)
            .set({ name: validated.title })
            .where(eq(collectionNodes.id, id));
    }

    if (data.visibility !== undefined) {
        await db
            .update(nodes)
            .set({ visibility: data.visibility, updatedAt: now })
            .where(eq(nodes.id, id));
    } else {
        await db.update(nodes).set({ updatedAt: now }).where(eq(nodes.id, id));
    }

    revalidatePath("/artworks");
    return { success: true as const };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a collection.
 * - FK cascade on node_relations.from_id automatically removes all CONTAINS edges
 *   FROM this collection — contained items (artworks, sub-collections) are NOT deleted,
 *   they float to root.
 * - FK cascade on collection_nodes.id removes the subtype row.
 * - If this collection is itself inside another collection, decrements the parent's itemCount.
 */
export async function deleteCollectionAction(id: string) {
    const user = await requireAuth();
    const db = await getDb();

    if (!(await assertOwner(db, id, user.id)))
        return { success: false as const, error: "Unauthorized" };

    // Find parent collection (if this collection is inside one)
    const [parentRel] = await db
        .select({ fromId: nodeRelations.fromId })
        .from(nodeRelations)
        .where(
            and(
                eq(nodeRelations.toId, id),
                eq(nodeRelations.type, RELATION_TYPES.CONTAINS),
            ),
        )
        .limit(1);

    if (parentRel) {
        await db
            .update(collectionNodes)
            .set({ itemCount: sql`max(0, item_count - 1)` })
            .where(eq(collectionNodes.id, parentRel.fromId));
    }

    // Delete the node — cascades: collection_nodes row + all node_relations FROM it
    await db.delete(nodes).where(eq(nodes.id, id));

    revalidatePath("/artworks");
    return { success: true as const };
}

// ─── Remove from collection ───────────────────────────────────────────────────

/**
 * Remove an item from a specific collection without deleting it.
 * Auth: user must own the COLLECTION (not necessarily the item) — supports cross-user boards.
 * If collectionId is omitted, removes from the first CONTAINS edge found (owner must own item).
 */
export async function removeFromCollectionAction(
    itemId: string,
    collectionId?: string,
) {
    const user = await requireAuth();
    const db = await getDb();

    let targetCollectionId: string;

    if (collectionId) {
        // Cross-user board: check user owns the COLLECTION, not the item
        if (!(await assertOwner(db, collectionId, user.id)))
            return { success: false as const, error: "Unauthorized" };
        targetCollectionId = collectionId;
    } else {
        // Dir-like: user must own the item itself
        if (!(await assertOwner(db, itemId, user.id)))
            return { success: false as const, error: "Unauthorized" };
        const [existingRel] = await db
            .select({ fromId: nodeRelations.fromId })
            .from(nodeRelations)
            .where(
                and(
                    eq(nodeRelations.toId, itemId),
                    eq(nodeRelations.type, RELATION_TYPES.CONTAINS),
                ),
            )
            .limit(1);
        if (!existingRel) return { success: true as const };
        targetCollectionId = existingRel.fromId;
    }

    const [existingRel] = await db
        .select({ fromId: nodeRelations.fromId })
        .from(nodeRelations)
        .where(
            and(
                eq(nodeRelations.fromId, targetCollectionId),
                eq(nodeRelations.toId, itemId),
                eq(nodeRelations.type, RELATION_TYPES.CONTAINS),
            ),
        )
        .limit(1);

    if (!existingRel) return { success: true as const }; // already not in this collection

    await db
        .delete(nodeRelations)
        .where(
            and(
                eq(nodeRelations.fromId, targetCollectionId),
                eq(nodeRelations.toId, itemId),
                eq(nodeRelations.type, RELATION_TYPES.CONTAINS),
            ),
        );

    await db
        .update(collectionNodes)
        .set({ itemCount: sql`max(0, item_count - 1)` })
        .where(eq(collectionNodes.id, targetCollectionId));

    revalidatePath("/artworks");
    return { success: true as const };
}
