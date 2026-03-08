"use server";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import { nodeRelations } from "@/modules/nodes/schemas/node-relation.schema";
import { workspaceItems as artworkData } from "@/modules/artworks/schemas/workspace-item.schema";
import { collectionNodes } from "@/modules/artworks/schemas/collection-node.schema";
import {
    member,
    organization,
} from "@/modules/profiles/schemas/org-plugin.schema";
import { RELATION_TYPES } from "@/constants/relation-types";
import type { CollectionWorkspaceItem } from "@/modules/artworks/models/workspace-item.model";
import type { WorkspaceQuery } from "@/modules/artworks/models/workspace-item.model";
import type { DiscoverItem } from "@/modules/artworks/actions/get-discover-items.action";

export type DiscoverWorkspaceItem = DiscoverItem | CollectionWorkspaceItem;

export interface DiscoverWorkspaceResult {
    items: DiscoverWorkspaceItem[];
    hasMore: boolean;
}

export async function getDiscoverWorkspaceItemsAction(
    query: WorkspaceQuery,
): Promise<DiscoverWorkspaceResult> {
    const db = await getDb();
    const { collectionId, sort, order, offset, limit } = query;

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
                .where(and(inArray(nodes.id, childIds), visibilityClause)),
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
                .where(and(inArray(nodes.id, childIds), visibilityClause)),
        ]);

        const posMap = new Map(relations.map((r) => [r.toId, r.position ?? 0]));
        const items: DiscoverWorkspaceItem[] = [
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
                ownerName: null,
                ownerSlug: null,
            })),
        ].sort((a, b) => (posMap.get(a.id) ?? 0) - (posMap.get(b.id) ?? 0));

        const hasMore = items.length > limit;
        return { items: hasMore ? items.slice(0, limit) : items, hasMore };
    }

    // ── Root level ────────────────────────────────────────────────────────────
    const [artworkRows, collectionRows, containedIds] = await Promise.all([
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
                ownerName: organization.name,
                ownerSlug: organization.slug,
            })
            .from(nodes)
            .innerJoin(artworkData, eq(artworkData.id, nodes.id))
            .leftJoin(
                member,
                and(
                    eq(member.userId, nodes.createdBy),
                    eq(member.role, "owner"),
                ),
            )
            .leftJoin(organization, eq(organization.id, member.organizationId))
            .where(visibilityClause)
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
            .where(visibilityClause)
            .orderBy(collectionOrderExpr)
            .limit(limit + 1)
            .offset(offset),

        db
            .selectDistinct({ toId: nodeRelations.toId })
            .from(nodeRelations)
            .where(eq(nodeRelations.type, RELATION_TYPES.CONTAINS)),
    ]);

    const containedSet = new Set(containedIds.map((r) => r.toId));
    const rootArtworks = artworkRows.filter((r) => !containedSet.has(r.id));
    const rootCollections = collectionRows.filter(
        (r) => !containedSet.has(r.id),
    );

    const merged: DiscoverWorkspaceItem[] = [
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
            ownerName: row.ownerName ?? null,
            ownerSlug: row.ownerSlug ?? null,
        })),
    ];

    const hasMore = merged.length > limit;
    return { items: hasMore ? merged.slice(0, limit) : merged, hasMore };
}
