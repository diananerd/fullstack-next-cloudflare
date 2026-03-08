"use server";

import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
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
import {
    queryCollectionItems,
    rowToWorkspaceItem,
} from "./workspace-nodes.query";
import type {
    ArtworkWorkspaceItem,
    CollectionWorkspaceItem,
    WorkspaceQuery,
} from "@/modules/artworks/models/workspace-item.model";

/** Artwork item with platform owner attribution — used in discover views. */
export interface DiscoverItem extends ArtworkWorkspaceItem {
    ownerName: string | null;
    ownerSlug: string | null;
}

export type DiscoverWorkspaceItem = DiscoverItem | CollectionWorkspaceItem;

export interface DiscoverWorkspaceResult {
    items: DiscoverWorkspaceItem[];
    hasMore: boolean;
}

export async function getDiscoverWorkspaceItemsAction(
    query: WorkspaceQuery,
): Promise<DiscoverWorkspaceResult> {
    const db = await getDb();
    const { collectionId, sort, order, limit, offset } = query;

    const visibilityFilter = eq(nodes.visibility, "public");

    // ── Inside a collection: standard query, no owner info needed ────────────
    if (collectionId) {
        const result = await queryCollectionItems(db, collectionId, query, {
            visibilityFilter,
            collectionRole: "viewer",
        });
        return result as DiscoverWorkspaceResult;
    }

    // ── Root discover: single query, left-joined with owner info ─────────────
    // Only exclude items inside FOLDERS (move semantics = item disappears from root).
    // Collections (boards) use reference semantics — artworks saved to boards
    // still appear at their owner's root. Folders are always private so this
    // yields an empty set for public queries, which is correct.
    const containedResult = await db
        .selectDistinct({ toId: nodeRelations.toId })
        .from(nodeRelations)
        .innerJoin(nodes, eq(nodes.id, nodeRelations.fromId))
        .where(
            and(
                eq(nodeRelations.type, RELATION_TYPES.CONTAINS),
                eq(nodes.type, "folder"),
            ),
        );
    const containedIds = containedResult.map((r) => r.toId);

    const titleSort = sql<string>`COALESCE(${artworkData.title}, ${collectionNodes.name})`;
    const sortField =
        sort === "title"
            ? titleSort
            : sort === "updatedAt"
              ? nodes.updatedAt
              : nodes.createdAt;
    const orderExpr = order === "asc" ? asc(sortField) : desc(sortField);

    const rows = await db
        .select({
            id: nodes.id,
            type: nodes.type,
            createdAt: nodes.createdAt,
            updatedAt: nodes.updatedAt,
            visibility: nodes.visibility,
            artworkTitle: artworkData.title,
            url: artworkData.url,
            r2Key: artworkData.r2Key,
            width: artworkData.width,
            height: artworkData.height,
            protectionStatus: artworkData.protectionStatus,
            allowDownload: artworkData.allowDownload,
            collectionName: collectionNodes.name,
            itemCount: collectionNodes.itemCount,
            ownerName: organization.name,
            ownerSlug: organization.slug,
        })
        .from(nodes)
        .leftJoin(
            artworkData,
            and(eq(artworkData.id, nodes.id), eq(nodes.type, "artwork")),
        )
        .leftJoin(
            collectionNodes,
            and(
                eq(collectionNodes.id, nodes.id),
                inArray(nodes.type, ["collection", "folder"]),
            ),
        )
        .leftJoin(
            member,
            and(eq(member.userId, nodes.createdBy), eq(member.role, "owner")),
        )
        .leftJoin(organization, eq(organization.id, member.organizationId))
        .where(
            and(
                eq(nodes.type, "artwork"),
                visibilityFilter,
                ...(containedIds.length > 0
                    ? [notInArray(nodes.id, containedIds)]
                    : []),
            ),
        )
        .orderBy(orderExpr)
        .limit(limit + 1)
        .offset(offset);

    const hasMore = rows.length > limit;
    const items: DiscoverWorkspaceItem[] = (
        hasMore ? rows.slice(0, limit) : rows
    ).map((row) => {
        if (row.type === "artwork") {
            return {
                kind: "artwork" as const,
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
                mediaType: "image" as const,
                allowDownload: row.allowDownload ?? false,
                ownerName: row.ownerName ?? null,
                ownerSlug: row.ownerSlug ?? null,
            } satisfies DiscoverItem;
        }
        return rowToWorkspaceItem(row, "viewer") as CollectionWorkspaceItem;
    });

    return { items, hasMore };
}
