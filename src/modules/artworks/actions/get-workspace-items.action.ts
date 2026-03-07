"use server";

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { workspaceItems } from "@/modules/artworks/schemas/workspace-item.schema";
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

    const orderExpr =
        sort === "title"
            ? order === "asc"
                ? asc(workspaceItems.title)
                : desc(workspaceItems.title)
            : sort === "updatedAt"
              ? order === "asc"
                  ? asc(workspaceItems.updatedAt)
                  : desc(workspaceItems.updatedAt)
              : order === "asc"
                ? asc(workspaceItems.createdAt)
                : desc(workspaceItems.createdAt);

    const whereClauses = [
        eq(workspaceItems.userId, user.id),
        collectionId
            ? eq(workspaceItems.parentId, collectionId)
            : isNull(workspaceItems.parentId),
        ...(visibility !== "all"
            ? [eq(workspaceItems.visibility, visibility)]
            : []),
    ];

    const rows = await db
        .select()
        .from(workspaceItems)
        .where(and(...whereClauses))
        .orderBy(orderExpr)
        .limit(limit + 1)
        .offset(offset);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items = page.map((row) => {
        if (row.kind === "collection") {
            return {
                kind: "collection" as const,
                id: row.id,
                title: row.title,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                visibility: row.visibility,
                itemCount: row.itemCount,
                role: "owner",
            };
        }
        return {
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
            protectionStatus: row.protectionStatus ?? "IDLE",
            mediaType: "image" as const,
        };
    });

    return { items, hasMore };
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
                id: workspaceItems.id,
                title: workspaceItems.title,
                parentId: workspaceItems.parentId,
            })
            .from(workspaceItems)
            .where(
                and(
                    eq(workspaceItems.id, currentId),
                    eq(workspaceItems.kind, "collection"),
                ),
            )
            .limit(1);
        if (!node) break;
        path.unshift({ id: node.id, title: node.title });
        currentId = node.parentId ?? null;
    }

    return path;
}
