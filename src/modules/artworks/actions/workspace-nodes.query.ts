/**
 * Shared internal query engine for workspace node lists.
 * All views that list items (artworks + collections) share this implementation.
 *
 * Pattern: single LEFT JOIN query on `nodes` discriminated by `nodes.type`.
 * - Correct global pagination (LIMIT/OFFSET on the unified set, not per subtype).
 * - Consistent sort across both types: COALESCE(artwork.title, collection.name).
 * - Specialization (card UI, owner info) is handled by the caller.
 */

import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import { nodeRelations } from "@/modules/nodes/schemas/node-relation.schema";
import { workspaceItems as artworkData } from "@/modules/artworks/schemas/workspace-item.schema";
import { collectionNodes } from "@/modules/artworks/schemas/collection-node.schema";
import { RELATION_TYPES } from "@/constants/relation-types";
import type {
    WorkspaceItem,
    WorkspaceItemsResult,
    WorkspaceQuery,
} from "@/modules/artworks/models/workspace-item.model";
import type { getDb } from "@/db";

type DB = Awaited<ReturnType<typeof getDb>>;

export interface NodeQueryScope {
    /**
     * Restrict nodes to a specific owner. Applied at root level only.
     * NOT applied to items inside a collection — a board can contain artworks
     * from multiple owners; access to the collection itself is the authorization gate.
     */
    ownerFilter?: SQL;
    /**
     * Restrict to a specific visibility. Applied both at root and inside collections.
     * Public views pass eq(nodes.visibility, "public"); owner views omit this.
     */
    visibilityFilter?: SQL;
    /** Role to assign to collection items in the result. */
    collectionRole?: string;
}

// ── Shared SELECT clause ──────────────────────────────────────────────────────

const NODE_FIELDS = {
    id: nodes.id,
    type: nodes.type,
    createdAt: nodes.createdAt,
    updatedAt: nodes.updatedAt,
    visibility: nodes.visibility,
    // Artwork subtype fields (null for collections)
    artworkTitle: artworkData.title,
    url: artworkData.url,
    r2Key: artworkData.r2Key,
    width: artworkData.width,
    height: artworkData.height,
    protectionStatus: artworkData.protectionStatus,
    allowDownload: artworkData.allowDownload,
    // Collection subtype fields (null for artworks)
    collectionName: collectionNodes.name,
    itemCount: collectionNodes.itemCount,
} as const;

// ── Row → WorkspaceItem mapper ────────────────────────────────────────────────

type NodeRow = {
    id: string;
    type: string;
    createdAt: string;
    updatedAt: string;
    visibility: string;
    artworkTitle: string | null;
    url: string | null;
    r2Key: string | null;
    width: number | null;
    height: number | null;
    protectionStatus: string | null;
    allowDownload: boolean | null;
    collectionName: string | null;
    itemCount: number | null;
};

export function rowToWorkspaceItem(
    row: NodeRow,
    collectionRole = "viewer",
): WorkspaceItem {
    if (row.type === "artwork") {
        return {
            kind: "artwork",
            id: row.id,
            title: row.artworkTitle ?? "",
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            visibility: row.visibility,
            url: row.url ?? "",
            r2Key: row.r2Key ?? "",
            width: row.width ?? null,
            height: row.height ?? null,
            protectionStatus: row.protectionStatus ?? "idle",
            mediaType: "image",
            allowDownload: row.allowDownload ?? false,
        };
    }
    return {
        kind: "collection",
        id: row.id,
        title: row.collectionName ?? "",
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        visibility: row.visibility,
        itemCount: row.itemCount ?? 0,
        role: collectionRole,
    };
}

// ── Shared LEFT JOINs for subtype fields ──────────────────────────────────────

function applySubtypeJoins<T extends { leftJoin: (...args: any[]) => any }>(
    qb: T,
) {
    return (qb as any)
        .leftJoin(
            artworkData,
            and(eq(artworkData.id, nodes.id), eq(nodes.type, "artwork")),
        )
        .leftJoin(
            collectionNodes,
            and(eq(collectionNodes.id, nodes.id), eq(nodes.type, "collection")),
        );
}

// ── Collection path: items inside a specific collection ───────────────────────

export async function queryCollectionItems(
    db: DB,
    collectionId: string,
    query: WorkspaceQuery,
    scope: NodeQueryScope,
): Promise<WorkspaceItemsResult> {
    const { ownerFilter, visibilityFilter, collectionRole = "viewer" } = scope;
    const { limit, offset } = query;

    // Single query: INNER JOIN nodeRelations to filter children + get position
    const baseQuery = db
        .select({ ...NODE_FIELDS, position: nodeRelations.position })
        .from(nodes)
        .innerJoin(
            nodeRelations,
            and(
                eq(nodeRelations.toId, nodes.id),
                eq(nodeRelations.fromId, collectionId),
                eq(nodeRelations.type, RELATION_TYPES.CONTAINS),
            ),
        );

    const withJoins = baseQuery
        .leftJoin(
            artworkData,
            and(eq(artworkData.id, nodes.id), eq(nodes.type, "artwork")),
        )
        .leftJoin(
            collectionNodes,
            and(eq(collectionNodes.id, nodes.id), eq(nodes.type, "collection")),
        );

    // ownerFilter intentionally NOT applied here: the collection edge is the
    // authorization gate. Items can come from any owner (cross-user boards).
    // visibilityFilter still applies so public views only show public items.
    const rows = await withJoins
        .where(and(...(visibilityFilter ? [visibilityFilter] : [])))
        .orderBy(asc(nodeRelations.position))
        .limit(limit + 1)
        .offset(offset);

    const hasMore = rows.length > limit;
    return {
        items: (hasMore ? rows.slice(0, limit) : rows).map((row) =>
            rowToWorkspaceItem(row, collectionRole),
        ),
        hasMore,
    };
}

// ── Root path: top-level items (not inside any collection) ───────────────────

export async function queryRootItems(
    db: DB,
    query: WorkspaceQuery,
    scope: NodeQueryScope,
): Promise<WorkspaceItemsResult> {
    const { ownerFilter, visibilityFilter, collectionRole = "viewer" } = scope;
    const { sort, order, limit, offset } = query;

    // Step 1: IDs of items already inside a collection (scoped to owner if provided)
    const containedResult = await db
        .selectDistinct({ toId: nodeRelations.toId })
        .from(nodeRelations)
        .innerJoin(nodes, eq(nodes.id, nodeRelations.fromId))
        .where(
            and(
                eq(nodeRelations.type, RELATION_TYPES.CONTAINS),
                ...(ownerFilter ? [ownerFilter] : []),
            ),
        );
    const containedIds = containedResult.map((r) => r.toId);

    // Step 2: Single unified query — nodes, left-joined with both subtype tables.
    // Title sort uses COALESCE so collections and artworks sort together.
    const titleSort = sql<string>`COALESCE(${artworkData.title}, ${collectionNodes.name})`;
    const sortField =
        sort === "title"
            ? titleSort
            : sort === "updatedAt"
              ? nodes.updatedAt
              : nodes.createdAt;
    const orderExpr = order === "asc" ? asc(sortField) : desc(sortField);

    const rows = await db
        .select(NODE_FIELDS)
        .from(nodes)
        .leftJoin(
            artworkData,
            and(eq(artworkData.id, nodes.id), eq(nodes.type, "artwork")),
        )
        .leftJoin(
            collectionNodes,
            and(eq(collectionNodes.id, nodes.id), eq(nodes.type, "collection")),
        )
        .where(
            and(
                inArray(nodes.type, ["artwork", "collection"]),
                ...(ownerFilter ? [ownerFilter] : []),
                ...(visibilityFilter ? [visibilityFilter] : []),
                ...(containedIds.length > 0
                    ? [notInArray(nodes.id, containedIds)]
                    : []),
            ),
        )
        .orderBy(orderExpr)
        .limit(limit + 1)
        .offset(offset);

    const hasMore = rows.length > limit;
    return {
        items: (hasMore ? rows.slice(0, limit) : rows).map((row) =>
            rowToWorkspaceItem(row, collectionRole),
        ),
        hasMore,
    };
}

// ── Breadcrumb ancestor resolution ───────────────────────────────────────────

export async function resolveCollectionPath(
    db: DB,
    collectionId: string,
): Promise<{ id: string; title: string }[]> {
    const path: { id: string; title: string }[] = [];
    let currentId: string | null = collectionId;

    for (let depth = 0; depth < 10 && currentId; depth++) {
        const [node] = await db
            .select({ id: collectionNodes.id, title: collectionNodes.name })
            .from(collectionNodes)
            .where(eq(collectionNodes.id, currentId))
            .limit(1);
        if (!node) break;
        path.unshift({ id: node.id, title: node.title });

        const [parentRel] = await db
            .select({ fromId: nodeRelations.fromId })
            .from(nodeRelations)
            .where(
                and(
                    eq(nodeRelations.toId, currentId),
                    eq(nodeRelations.type, RELATION_TYPES.CONTAINS),
                ),
            )
            .limit(1);
        currentId = parentRel?.fromId ?? null;
    }

    return path;
}
