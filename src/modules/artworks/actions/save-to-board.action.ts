"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import { nodeRelations } from "@/modules/nodes/schemas/node-relation.schema";
import { collectionNodes } from "@/modules/artworks/schemas/collection-node.schema";
import { RELATION_TYPES } from "@/constants/relation-types";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { parseCollectionTitle } from "@/modules/artworks/utils/collection-title";

// ─── Read ─────────────────────────────────────────────────────────────────────

/** List all boards (collections) owned by the authenticated user. */
export async function getUserBoardsAction() {
    const user = await requireAuth();
    const db = await getDb();

    const rows = await db
        .select({
            id: collectionNodes.id,
            name: collectionNodes.name,
            itemCount: collectionNodes.itemCount,
            visibility: nodes.visibility,
        })
        .from(collectionNodes)
        .innerJoin(nodes, eq(nodes.id, collectionNodes.id))
        .where(and(eq(nodes.createdBy, user.id), eq(nodes.type, "collection")))
        .orderBy(desc(nodes.updatedAt));

    return rows as {
        id: string;
        name: string;
        itemCount: number;
        visibility: string;
    }[];
}

/**
 * Return the IDs of the current user's boards that contain a given artwork.
 * Used to populate the save-to-board dialog checkboxes.
 */
export async function getArtworkBoardMembershipAction(
    artworkId: string,
): Promise<string[]> {
    const user = await requireAuth();
    const db = await getDb();

    const rows = await db
        .select({ collectionId: nodeRelations.fromId })
        .from(nodeRelations)
        .innerJoin(nodes, eq(nodes.id, nodeRelations.fromId))
        .where(
            and(
                eq(nodeRelations.toId, artworkId),
                eq(nodeRelations.type, RELATION_TYPES.CONTAINS),
                eq(nodes.createdBy, user.id),
            ),
        );

    return rows.map((r) => r.collectionId);
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

/**
 * Add artwork to a board if not saved; remove if already saved.
 * Auth: user must own the board (not the artwork — cross-user save is allowed).
 * Returns { saved: true } when added, { saved: false } when removed.
 */
export async function toggleArtworkBoardAction(
    artworkId: string,
    collectionId: string,
) {
    const user = await requireAuth();
    const db = await getDb();

    // Verify user owns the collection
    const [collection] = await db
        .select({ id: nodes.id })
        .from(nodes)
        .where(
            and(
                eq(nodes.id, collectionId),
                eq(nodes.createdBy, user.id),
                eq(nodes.type, "collection"),
            ),
        )
        .limit(1);

    if (!collection) return { success: false as const, error: "Unauthorized" };

    // Check if already saved
    const [existing] = await db
        .select({ id: nodeRelations.id })
        .from(nodeRelations)
        .where(
            and(
                eq(nodeRelations.fromId, collectionId),
                eq(nodeRelations.toId, artworkId),
                eq(nodeRelations.type, RELATION_TYPES.CONTAINS),
            ),
        )
        .limit(1);

    if (existing) {
        await db
            .delete(nodeRelations)
            .where(
                and(
                    eq(nodeRelations.fromId, collectionId),
                    eq(nodeRelations.toId, artworkId),
                    eq(nodeRelations.type, RELATION_TYPES.CONTAINS),
                ),
            );
        await db
            .update(collectionNodes)
            .set({ itemCount: sql`max(0, item_count - 1)` })
            .where(eq(collectionNodes.id, collectionId));

        revalidatePath("/artworks");
        return { success: true as const, saved: false };
    }

    await db.insert(nodeRelations).values({
        fromId: collectionId,
        toId: artworkId,
        type: RELATION_TYPES.CONTAINS,
        createdBy: user.id,
    });
    await db
        .update(collectionNodes)
        .set({ itemCount: sql`item_count + 1` })
        .where(eq(collectionNodes.id, collectionId));

    revalidatePath("/artworks");
    return { success: true as const, saved: true };
}

// ─── Create + save ────────────────────────────────────────────────────────────

/**
 * Create a new private board and immediately save the artwork to it.
 * Returns the new board's id on success.
 */
export async function createBoardAndSaveAction(
    artworkId: string,
    rawName: string,
) {
    const user = await requireAuth();
    const validated = parseCollectionTitle(rawName);
    if (!validated.ok)
        return { success: false as const, error: validated.error };

    const db = await getDb();
    const collectionId = crypto.randomUUID();

    await db.insert(nodes).values({
        id: collectionId,
        type: "collection",
        createdBy: user.id,
        visibility: "private",
    });

    await db.insert(collectionNodes).values({
        id: collectionId,
        name: validated.title,
        itemCount: 1,
    });

    await db.insert(nodeRelations).values({
        fromId: collectionId,
        toId: artworkId,
        type: RELATION_TYPES.CONTAINS,
        createdBy: user.id,
    });

    revalidatePath("/artworks");
    return { success: true as const, collectionId, name: validated.title };
}
