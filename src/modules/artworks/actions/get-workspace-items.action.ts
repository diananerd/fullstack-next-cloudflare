"use server";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import type {
    WorkspaceItemsResult,
    WorkspaceQuery,
} from "@/modules/artworks/models/workspace-item.model";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { PlacementContext } from "@/modules/social/models/collection.enum";
import { collectionItems } from "@/modules/social/schemas/collection-item.schema";
import { collectionMembers } from "@/modules/social/schemas/collection-member.schema";
import { collectionPlacements } from "@/modules/social/schemas/collection-placement.schema";
import { collections } from "@/modules/social/schemas/collection.schema";

// Infer result row type from the artwork SELECT shape.
type UnifiedRow = {
    kind: string;
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    visibility: string;
    url: string | null;
    r2Key: string | null;
    width: number | null;
    height: number | null;
    protectionStatus: string | null;
    itemCount: number | null;
    role: string | null;
};

function sortExpr(
    sort: WorkspaceQuery["sort"],
    order: WorkspaceQuery["order"],
) {
    if (sort === "title")
        return order === "asc" ? sql`title ASC` : sql`title DESC`;
    if (sort === "updatedAt")
        return order === "asc" ? sql`updated_at ASC` : sql`updated_at DESC`;
    return order === "asc" ? sql`created_at ASC` : sql`created_at DESC`;
}

/** Build the collection subquery for a given context (root workspace or inside a collection). */
function buildCollQ(
    db: Awaited<ReturnType<typeof getDb>>,
    userId: string,
    collectionId: string | undefined,
    collVisClauses: ReturnType<typeof eq>[],
) {
    const ctxWhere = collectionId
        ? and(
              eq(collectionPlacements.contextType, PlacementContext.COLLECTION),
              eq(collectionPlacements.contextId, collectionId),
              ...collVisClauses,
          )
        : and(
              eq(collectionPlacements.contextType, PlacementContext.WORKSPACE),
              eq(collectionPlacements.contextId, userId),
              ...collVisClauses,
          );

    return db
        .select({
            kind: sql<string>`'collection'`,
            id: collections.id,
            title: collections.title,
            createdAt: collections.createdAt,
            updatedAt: collections.updatedAt,
            visibility: collections.visibility,
            url: sql<string | null>`NULL`,
            r2Key: sql<string | null>`NULL`,
            width: sql<number | null>`NULL`,
            height: sql<number | null>`NULL`,
            protectionStatus: sql<string | null>`NULL`,
            itemCount: sql<number | null>`${collections.itemCount}`,
            role: sql<string | null>`${collectionMembers.role}`,
        })
        .from(collectionPlacements)
        .innerJoin(
            collections,
            eq(collectionPlacements.collectionId, collections.id),
        )
        .innerJoin(
            collectionMembers,
            and(
                eq(collectionMembers.collectionId, collections.id),
                eq(collectionMembers.userId, userId),
            ),
        )
        .where(ctxWhere);
}

export async function getWorkspaceItemsAction(
    query: WorkspaceQuery,
): Promise<WorkspaceItemsResult> {
    const user = await requireAuth();
    const db = await getDb();

    const { collectionId, sort, order, visibility, offset, limit } = query;

    const artworkVisClauses =
        visibility !== "all" ? [eq(artworks.visibility, visibility)] : [];
    const collVisClauses =
        visibility !== "all" ? [eq(collections.visibility, visibility)] : [];

    const collQ = buildCollQ(db, user.id, collectionId, collVisClauses);

    // ── UNION ALL: artworks (paginated) + collections (all, pre-sort) ─────────
    // Each branch is its own query; TypeScript infers the correct type per branch.
    const rowsRaw: UnifiedRow[] = collectionId
        ? // Inside a collection: artworks via collection_items JOIN artworks
          await db
              .select({
                  kind: sql<string>`'artwork'`,
                  id: sql<string>`cast(${artworks.id} as text)`,
                  title: artworks.title,
                  createdAt: artworks.createdAt,
                  updatedAt: artworks.updatedAt,
                  visibility: artworks.visibility,
                  url: sql<string | null>`${artworks.url}`,
                  r2Key: sql<string | null>`${artworks.r2Key}`,
                  width: artworks.width,
                  height: artworks.height,
                  protectionStatus: sql<
                      string | null
                  >`${artworks.protectionStatus}`,
                  itemCount: sql<number | null>`NULL`,
                  role: sql<string | null>`NULL`,
              })
              .from(collectionItems)
              .innerJoin(artworks, eq(collectionItems.artworkId, artworks.id))
              .where(
                  and(
                      eq(collectionItems.collectionId, collectionId),
                      ...artworkVisClauses,
                  ),
              )
              .unionAll(collQ)
              .orderBy(sortExpr(sort, order))
              .limit(limit + 1)
              .offset(offset)
        : // Workspace root: artworks directly
          await db
              .select({
                  kind: sql<string>`'artwork'`,
                  id: sql<string>`cast(${artworks.id} as text)`,
                  title: artworks.title,
                  createdAt: artworks.createdAt,
                  updatedAt: artworks.updatedAt,
                  visibility: artworks.visibility,
                  url: sql<string | null>`${artworks.url}`,
                  r2Key: sql<string | null>`${artworks.r2Key}`,
                  width: artworks.width,
                  height: artworks.height,
                  protectionStatus: sql<
                      string | null
                  >`${artworks.protectionStatus}`,
                  itemCount: sql<number | null>`NULL`,
                  role: sql<string | null>`NULL`,
              })
              .from(artworks)
              .where(and(eq(artworks.userId, user.id), ...artworkVisClauses))
              .unionAll(collQ)
              .orderBy(sortExpr(sort, order))
              .limit(limit + 1)
              .offset(offset);

    const hasMore = rowsRaw.length > limit;
    const page = hasMore ? rowsRaw.slice(0, limit) : rowsRaw;

    const items = page.map((row) => {
        if (row.kind === "collection") {
            return {
                kind: "collection" as const,
                id: row.id,
                title: row.title,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                visibility: row.visibility,
                itemCount: row.itemCount ?? 0,
                role: row.role ?? "viewer",
            };
        }
        return {
            kind: "artwork" as const,
            id: Number(row.id),
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
        const [coll] = await db
            .select({ id: collections.id, title: collections.title })
            .from(collections)
            .where(eq(collections.id, currentId))
            .limit(1);
        if (!coll) break;
        path.unshift(coll);

        const [parent] = await db
            .select({ contextId: collectionPlacements.contextId })
            .from(collectionPlacements)
            .where(
                and(
                    eq(collectionPlacements.collectionId, currentId),
                    eq(
                        collectionPlacements.contextType,
                        PlacementContext.COLLECTION,
                    ),
                ),
            )
            .limit(1);

        currentId = parent?.contextId ?? null;
    }

    return path;
}
