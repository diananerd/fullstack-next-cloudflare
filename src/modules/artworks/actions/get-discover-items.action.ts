"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import { workspaceItems as artworkData } from "@/modules/artworks/schemas/workspace-item.schema";
import {
    member,
    organization,
} from "@/modules/profiles/schemas/org-plugin.schema";
import type { ArtworkWorkspaceItem } from "@/modules/artworks/models/workspace-item.model";

export interface DiscoverItem extends ArtworkWorkspaceItem {
    ownerName: string | null;
    ownerSlug: string | null;
}

export interface DiscoverQuery {
    sort: "createdAt" | "updatedAt" | "title";
    order: "asc" | "desc";
    offset: number;
    limit: number;
}

export interface DiscoverResult {
    items: DiscoverItem[];
    hasMore: boolean;
}

export async function getDiscoverItemsAction(
    query: DiscoverQuery,
): Promise<DiscoverResult> {
    const db = await getDb();
    const { sort, order, offset, limit } = query;

    const sortField =
        sort === "title"
            ? artworkData.title
            : sort === "updatedAt"
              ? nodes.updatedAt
              : nodes.createdAt;
    const orderExpr = order === "asc" ? asc(sortField) : desc(sortField);

    const rows = await db
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
            and(eq(member.userId, nodes.createdBy), eq(member.role, "owner")),
        )
        .leftJoin(organization, eq(organization.id, member.organizationId))
        .where(eq(nodes.visibility, "public"))
        .orderBy(orderExpr)
        .limit(limit + 1)
        .offset(offset);

    const hasMore = rows.length > limit;
    const items: DiscoverItem[] = (hasMore ? rows.slice(0, limit) : rows).map(
        (row) => ({
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
        }),
    );

    return { items, hasMore };
}
