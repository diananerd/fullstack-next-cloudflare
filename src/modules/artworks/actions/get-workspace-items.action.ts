"use server";

import { and, asc, desc, eq, getTableColumns } from "drizzle-orm";
import { getDb } from "@/db";
import { entities } from "@/modules/artworks/schemas/entity.schema";
import { workspaceItems as artworkData } from "@/modules/artworks/schemas/workspace-item.schema";
import { collectionNodes } from "@/modules/artworks/schemas/collection-node.schema";
import { entityRelations } from "@/modules/artworks/schemas/entity-relation.schema";
import { RELATION_TYPES } from "@/constants/relation-types";
import type {
    WorkspaceItemsResult,
    WorkspaceQuery,
} from "@/modules/artworks/models/workspace-item.model";
import { requireAuth } from "@/modules/auth/utils/auth-utils";

export async function getWorkspaceItemsAction(
    query: WorkspaceQuery,
): Promise<WorkspaceItemsResult> {
    const user = await requireAuth();
    const db = await getDb();

    const { collectionId, sort, order, visibility, offset, limit } = query;

    const orderField =
        sort === "title"
            ? artworkData.title
            : sort === "updatedAt"
              ? entities.updatedAt
              : entities.createdAt;

    const orderExpr = order === "asc" ? asc(orderField) : desc(orderField);

    const visibilityClause =
        visibility !== "all" ? eq(entities.visibility, visibility) : undefined;

    if (collectionId) {
        // Items inside a collection: find via entity_relations (contains)
        // Returns both artworks and sub-collections contained in this collection.
        const relations = await db
            .select({
                toId: entityRelations.toId,
                position: entityRelations.position,
            })
            .from(entityRelations)
            .where(
                and(
                    eq(entityRelations.fromId, collectionId),
                    eq(entityRelations.type, RELATION_TYPES.CONTAINS),
                ),
            );

        const childIds = relations.map((r) => r.toId);

        if (childIds.length === 0) return { items: [], hasMore: false };

        // Fetch artwork children
        const artworkRows = await db
            .select({
                ...getTableColumns(entities),
                ...getTableColumns(artworkData),
                userId: entities.createdBy,
            })
            .from(entities)
            .innerJoin(artworkData, eq(artworkData.id, entities.id))
            .where(
                and(
                    eq(entities.createdBy, user.id),
                    ...(visibilityClause ? [visibilityClause] : []),
                ),
            );

        const artworkChildren = artworkRows.filter((r) =>
            childIds.includes(r.id),
        );

        // Fetch collection children
        const collectionRows = await db
            .select({
                ...getTableColumns(entities),
                ...getTableColumns(collectionNodes),
                userId: entities.createdBy,
            })
            .from(entities)
            .innerJoin(collectionNodes, eq(collectionNodes.id, entities.id))
            .where(
                and(
                    eq(entities.createdBy, user.id),
                    ...(visibilityClause ? [visibilityClause] : []),
                ),
            );

        const collectionChildren = collectionRows.filter((r) =>
            childIds.includes(r.id),
        );

        const posMap = new Map(relations.map((r) => [r.toId, r.position ?? 0]));

        const items = [
            ...collectionChildren.map((row) => ({
                kind: "collection" as const,
                id: row.id,
                title: row.name,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                visibility: row.visibility,
                itemCount: row.itemCount,
                role: "owner",
            })),
            ...artworkChildren.map((row) => ({
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

    // Root level: items with no 'contains' relation pointing TO them from this user's entities
    // Simpler: items owned by user that are NOT the target of any 'contains' relation
    // (i.e., not inside any collection)
    const ownedArtworkRows = await db
        .select({
            ...getTableColumns(entities),
            ...getTableColumns(artworkData),
            userId: entities.createdBy,
        })
        .from(entities)
        .innerJoin(artworkData, eq(artworkData.id, entities.id))
        .where(
            and(
                eq(entities.createdBy, user.id),
                ...(visibilityClause ? [visibilityClause] : []),
            ),
        )
        .orderBy(orderExpr)
        .limit(limit + 1)
        .offset(offset);

    const ownedCollectionRows = await db
        .select({
            ...getTableColumns(entities),
            ...getTableColumns(collectionNodes),
            userId: entities.createdBy,
        })
        .from(entities)
        .innerJoin(collectionNodes, eq(collectionNodes.id, entities.id))
        .where(
            and(
                eq(entities.createdBy, user.id),
                ...(visibilityClause ? [visibilityClause] : []),
            ),
        )
        .orderBy(orderExpr)
        .limit(limit + 1)
        .offset(offset);

    // Filter to root-only: not contained in any other entity
    const containedIds = await db
        .selectDistinct({ toId: entityRelations.toId })
        .from(entityRelations)
        .where(eq(entityRelations.type, RELATION_TYPES.CONTAINS));

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
            role: "owner",
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

// ── Breadcrumb ancestor resolution ───────────────────────────────────────────
export async function resolveCollectionPath(
    collectionId: string,
): Promise<{ id: string; title: string }[]> {
    const db = await getDb();
    const path: { id: string; title: string }[] = [];
    let currentId: string | null = collectionId;

    for (let depth = 0; depth < 10 && currentId; depth++) {
        const [node] = await db
            .select({
                id: collectionNodes.id,
                title: collectionNodes.name,
            })
            .from(collectionNodes)
            .where(eq(collectionNodes.id, currentId))
            .limit(1);
        if (!node) break;
        path.unshift({ id: node.id, title: node.title });

        // Find parent via entity_relations
        const [parentRel] = await db
            .select({ fromId: entityRelations.fromId })
            .from(entityRelations)
            .where(
                and(
                    eq(entityRelations.toId, currentId),
                    eq(entityRelations.type, RELATION_TYPES.CONTAINS),
                ),
            )
            .limit(1);
        currentId = parentRel?.fromId ?? null;
    }

    return path;
}
