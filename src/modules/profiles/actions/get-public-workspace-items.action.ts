"use server";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import { nodeRelations } from "@/modules/nodes/schemas/node-relation.schema";
import { workspaceItems as artworkData } from "@/modules/artworks/schemas/workspace-item.schema";
import { collectionNodes } from "@/modules/artworks/schemas/collection-node.schema";
import { RELATION_TYPES } from "@/constants/relation-types";
import type {
    WorkspaceItemsResult,
    WorkspaceQuery,
} from "@/modules/artworks/models/workspace-item.model";

export async function getPublicWorkspaceItemsAction(
    ownerUserId: string,
    query: WorkspaceQuery,
): Promise<WorkspaceItemsResult> {
    const db = await getDb();

    const { collectionId, sort, order, offset, limit } = query;

    // Public profile always shows only public items
    const visibilityClause = eq(nodes.visibility, "public");

    const artworkSortField =
        sort === "title"
            ? artworkData.title
            : sort === "updatedAt"
              ? nodes.updatedAt
              : nodes.createdAt;
    const collectionSortField =
        sort === "title"
            ? collectionNodes.name
            : sort === "updatedAt"
              ? nodes.updatedAt
              : nodes.createdAt;
    const artworkOrderExpr =
        order === "asc" ? asc(artworkSortField) : desc(artworkSortField);
    const collectionOrderExpr =
        order === "asc" ? asc(collectionSortField) : desc(collectionSortField);

    // ── Inside a collection ───────────────────────────────────────────────────
    if (collectionId) {
        const relations = await db
            .select({
                toId: nodeRelations.toId,
                position: nodeRelations.position,
            })
            .from(nodeRelations)
            .where(
                and(
                    eq(nodeRelations.fromId, collectionId),
                    eq(nodeRelations.type, RELATION_TYPES.CONTAINS),
                ),
            );

        const childIds = relations.map((r) => r.toId);
        if (childIds.length === 0) return { items: [], hasMore: false };

        const ownerFilter = eq(nodes.createdBy, ownerUserId);

        const [artworkRows, collectionRows] = await Promise.all([
            db
                .select({
                    id: nodes.id,
                    title: artworkData.title,
                    createdAt: nodes.createdAt,
                    updatedAt: nodes.updatedAt,
                    visibility: nodes.visibility,
                    url: artworkData.url,
                    r2Key: artworkData.r2Key,
                    width: artworkData.width,
                    height: artworkData.height,
                    protectionStatus: artworkData.protectionStatus,
                })
                .from(nodes)
                .innerJoin(artworkData, eq(artworkData.id, nodes.id))
                .where(
                    and(
                        ownerFilter,
                        inArray(nodes.id, childIds),
                        ...(visibilityClause ? [visibilityClause] : []),
                    ),
                ),
            db
                .select({
                    id: nodes.id,
                    name: collectionNodes.name,
                    createdAt: nodes.createdAt,
                    updatedAt: nodes.updatedAt,
                    visibility: nodes.visibility,
                    itemCount: collectionNodes.itemCount,
                })
                .from(nodes)
                .innerJoin(collectionNodes, eq(collectionNodes.id, nodes.id))
                .where(
                    and(
                        ownerFilter,
                        inArray(nodes.id, childIds),
                        ...(visibilityClause ? [visibilityClause] : []),
                    ),
                ),
        ]);

        const posMap = new Map(relations.map((r) => [r.toId, r.position ?? 0]));
        const items = [
            ...collectionRows.map((row) => ({
                kind: "collection" as const,
                id: row.id,
                title: row.name,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                visibility: row.visibility,
                itemCount: row.itemCount,
                role: "viewer",
            })),
            ...artworkRows.map((row) => ({
                kind: "artwork" as const,
                id: row.id,
                title: row.title,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                visibility: row.visibility,
                url: row.url ?? "",
                r2Key: row.r2Key ?? "",
                width: row.width ?? null,
                height: row.height ?? null,
                protectionStatus: row.protectionStatus ?? "idle",
                mediaType: "image" as const,
            })),
        ].sort((a, b) => (posMap.get(a.id) ?? 0) - (posMap.get(b.id) ?? 0));

        const hasMore = items.length > limit;
        return { items: hasMore ? items.slice(0, limit) : items, hasMore };
    }

    // ── Root level ────────────────────────────────────────────────────────────
    const ownerFilter = eq(nodes.createdBy, ownerUserId);

    const [ownedArtworkRows, ownedCollectionRows, containedIds] =
        await Promise.all([
            db
                .select({
                    id: nodes.id,
                    title: artworkData.title,
                    createdAt: nodes.createdAt,
                    updatedAt: nodes.updatedAt,
                    visibility: nodes.visibility,
                    url: artworkData.url,
                    r2Key: artworkData.r2Key,
                    width: artworkData.width,
                    height: artworkData.height,
                    protectionStatus: artworkData.protectionStatus,
                })
                .from(nodes)
                .innerJoin(artworkData, eq(artworkData.id, nodes.id))
                .where(
                    and(
                        ownerFilter,
                        ...(visibilityClause ? [visibilityClause] : []),
                    ),
                )
                .orderBy(artworkOrderExpr)
                .limit(limit + 1)
                .offset(offset),

            db
                .select({
                    id: nodes.id,
                    name: collectionNodes.name,
                    createdAt: nodes.createdAt,
                    updatedAt: nodes.updatedAt,
                    visibility: nodes.visibility,
                    itemCount: collectionNodes.itemCount,
                })
                .from(nodes)
                .innerJoin(collectionNodes, eq(collectionNodes.id, nodes.id))
                .where(
                    and(
                        ownerFilter,
                        ...(visibilityClause ? [visibilityClause] : []),
                    ),
                )
                .orderBy(collectionOrderExpr)
                .limit(limit + 1)
                .offset(offset),

            db
                .selectDistinct({ toId: nodeRelations.toId })
                .from(nodeRelations)
                .innerJoin(nodes, eq(nodes.id, nodeRelations.fromId))
                .where(
                    and(
                        eq(nodeRelations.type, RELATION_TYPES.CONTAINS),
                        ownerFilter,
                    ),
                ),
        ]);

    const containedSet = new Set(containedIds.map((r) => r.toId));
    const rootArtworks = ownedArtworkRows.filter(
        (r) => !containedSet.has(r.id),
    );
    const rootCollections = ownedCollectionRows.filter(
        (r) => !containedSet.has(r.id),
    );

    const merged = [
        ...rootCollections.map((row) => ({
            kind: "collection" as const,
            id: row.id,
            title: row.name,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            visibility: row.visibility,
            itemCount: row.itemCount,
            role: "viewer",
        })),
        ...rootArtworks.map((row) => ({
            kind: "artwork" as const,
            id: row.id,
            title: row.title,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            visibility: row.visibility,
            url: row.url ?? "",
            r2Key: row.r2Key ?? "",
            width: row.width ?? null,
            height: row.height ?? null,
            protectionStatus: row.protectionStatus ?? "idle",
            mediaType: "image" as const,
        })),
    ];

    const hasMore = merged.length > limit;
    return { items: hasMore ? merged.slice(0, limit) : merged, hasMore };
}
