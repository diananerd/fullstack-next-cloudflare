"use server";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import { nodeRelations } from "@/modules/nodes/schemas/node-relation.schema";
import { collectionNodes } from "@/modules/artworks/schemas/collection-node.schema";
import { RELATION_TYPES } from "@/constants/relation-types";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { parseCollectionTitle } from "@/modules/artworks/utils/collection-title";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A container (folder or board) usable as a tree node in the picker dialogs. */
export type ContainerTreeItem = {
    id: string;
    name: string;
    itemCount: number;
    /** Differentiates folders (private, move-semantics) from boards (cross-user saves). */
    containerType: "folder" | "collection";
};

/** A board-only tree item for the save-to-board dialog. */
export type BoardTreeItem = {
    id: string;
    name: string;
    itemCount: number;
};

// ── Private helpers ───────────────────────────────────────────────────────────

type DB = Awaited<ReturnType<typeof getDb>>;

/**
 * Get direct children of parentId that are containers (folder or collection).
 * If parentId is null, returns root-level containers (not nested inside any other container).
 */
async function getContainerChildren(
    db: DB,
    userId: string,
    nodeTypeFilter: ("folder" | "collection")[],
    parentId: string | null,
): Promise<ContainerTreeItem[]> {
    if (parentId === null) {
        // All containers of the requested types owned by user
        const allContainers = await db
            .select({ id: nodes.id })
            .from(nodes)
            .where(
                and(
                    eq(nodes.createdBy, userId),
                    inArray(nodes.type, nodeTypeFilter),
                ),
            );

        if (allContainers.length === 0) return [];
        const allIds = allContainers.map((r) => r.id);

        // Find which are nested inside another container (any type, owned by user)
        const childRows = await db
            .selectDistinct({ toId: nodeRelations.toId })
            .from(nodeRelations)
            .innerJoin(nodes, eq(nodes.id, nodeRelations.fromId))
            .where(
                and(
                    eq(nodeRelations.type, RELATION_TYPES.CONTAINS),
                    inArray(nodes.type, ["folder", "collection"]),
                    eq(nodes.createdBy, userId),
                    inArray(nodeRelations.toId, allIds),
                ),
            );

        const childIdSet = new Set(childRows.map((r) => r.toId));
        const rootIds = allIds.filter((id) => !childIdSet.has(id));
        if (rootIds.length === 0) return [];

        const rows = await db
            .select({
                id: collectionNodes.id,
                name: collectionNodes.name,
                itemCount: collectionNodes.itemCount,
                type: nodes.type,
            })
            .from(collectionNodes)
            .innerJoin(nodes, eq(nodes.id, collectionNodes.id))
            .where(inArray(collectionNodes.id, rootIds))
            .orderBy(desc(nodes.updatedAt));

        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            itemCount: r.itemCount ?? 0,
            containerType: r.type as "folder" | "collection",
        }));
    }

    // Children of a specific parent
    const rows = await db
        .select({
            id: collectionNodes.id,
            name: collectionNodes.name,
            itemCount: collectionNodes.itemCount,
            type: nodes.type,
        })
        .from(collectionNodes)
        .innerJoin(nodes, eq(nodes.id, collectionNodes.id))
        .innerJoin(
            nodeRelations,
            and(
                eq(nodeRelations.toId, nodes.id),
                eq(nodeRelations.fromId, parentId),
                eq(nodeRelations.type, RELATION_TYPES.CONTAINS),
            ),
        )
        .where(inArray(nodes.type, nodeTypeFilter))
        .orderBy(asc(nodeRelations.position));

    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        itemCount: r.itemCount ?? 0,
        containerType: r.type as "folder" | "collection",
    }));
}

// ── Tree navigation — Move dialog ─────────────────────────────────────────────

/**
 * Get direct child FOLDERS for the move-to dialog.
 * Move semantics live in folders only; boards are for the save dialog.
 * parentId=null → root level.
 */
export async function getFolderChildrenAction(
    parentId: string | null,
): Promise<ContainerTreeItem[]> {
    const user = await requireAuth();
    const db = await getDb();
    return getContainerChildren(db, user.id, ["folder"], parentId);
}

// ── Tree navigation — Save dialog ─────────────────────────────────────────────

/**
 * Get direct child BOARDS (collections only) for the save-to-board dialog.
 * parentId=null → root level boards.
 */
export async function getBoardChildrenAction(
    parentId: string | null,
): Promise<BoardTreeItem[]> {
    const user = await requireAuth();
    const db = await getDb();
    const items = await getContainerChildren(
        db,
        user.id,
        ["collection"],
        parentId,
    );
    return items.map(({ id, name, itemCount }) => ({ id, name, itemCount }));
}

// ── Read ─────────────────────────────────────────────────────────────────────

/** @deprecated Use getBoardChildrenAction for the tree dialog. */
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
 * Used to pre-populate the save-to-board dialog checkboxes.
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
                eq(nodes.type, "collection"),
            ),
        );

    return rows.map((r) => r.collectionId);
}

// ── Toggle ────────────────────────────────────────────────────────────────────

/**
 * Add artwork to a board if not saved; remove if already saved.
 * Auth: user must own the BOARD (not the artwork — cross-user saves allowed).
 */
export async function toggleArtworkBoardAction(
    artworkId: string,
    collectionId: string,
) {
    const user = await requireAuth();
    const db = await getDb();

    // Verify user owns the collection (board), not necessarily the artwork
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

// ── Create + save ─────────────────────────────────────────────────────────────

/**
 * Create a new private board and immediately save the artwork to it.
 * Optionally nest the board inside an existing parent container.
 */
export async function createBoardAndSaveAction(
    artworkId: string,
    rawName: string,
    parentId?: string | null,
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

    // Nest inside parent container if provided
    if (parentId) {
        await db.insert(nodeRelations).values({
            fromId: parentId,
            toId: collectionId,
            type: RELATION_TYPES.CONTAINS,
            createdBy: user.id,
        });
        await db
            .update(collectionNodes)
            .set({ itemCount: sql`item_count + 1` })
            .where(eq(collectionNodes.id, parentId));
    }

    revalidatePath("/artworks");
    return { success: true as const, collectionId, name: validated.title };
}
