"use server";

import { and, asc, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import type {
    ArtworkWorkspaceItem,
    CollectionWorkspaceItem,
    WorkspaceItemsResult,
    WorkspaceQuery,
} from "@/modules/artworks/models/workspace-item.model";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { PlacementContext } from "@/modules/social/models/collection.enum";
import { collectionItems } from "@/modules/social/schemas/collection-item.schema";
import { collectionMembers } from "@/modules/social/schemas/collection-member.schema";
import { collectionPlacements } from "@/modules/social/schemas/collection-placement.schema";
import { collections } from "@/modules/social/schemas/collection.schema";

function artworkOrder(
    sort: WorkspaceQuery["sort"],
    order: WorkspaceQuery["order"],
) {
    const dir = order === "asc" ? asc : desc;
    if (sort === "title") return dir(artworks.title);
    if (sort === "updatedAt") return dir(artworks.updatedAt);
    return dir(artworks.createdAt);
}

function collectionOrder(
    sort: WorkspaceQuery["sort"],
    order: WorkspaceQuery["order"],
) {
    const dir = order === "asc" ? asc : desc;
    if (sort === "title") return dir(collections.title);
    if (sort === "updatedAt") return dir(collections.updatedAt);
    return dir(collections.createdAt);
}

export async function getWorkspaceItemsAction(
    query: WorkspaceQuery,
): Promise<WorkspaceItemsResult> {
    const user = await requireAuth();
    const db = await getDb();

    const { collectionId, sort, order, visibility, offset, limit } = query;

    // ── Collections (always full — folders are not paginated) ─────────────────
    let rawCollections: CollectionWorkspaceItem[] = [];

    if (!collectionId) {
        // Root workspace: via placements contextType=WORKSPACE, contextId=userId
        const rows = await db
            .select({
                id: collections.id,
                title: collections.title,
                createdAt: collections.createdAt,
                updatedAt: collections.updatedAt,
                visibility: collections.visibility,
                itemCount: collections.itemCount,
                role: collectionMembers.role,
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
                    eq(collectionMembers.userId, user.id),
                ),
            )
            .where(
                and(
                    eq(collectionPlacements.contextType, PlacementContext.WORKSPACE),
                    eq(collectionPlacements.contextId, user.id),
                ),
            )
            .orderBy(collectionOrder(sort, order));

        rawCollections = rows.map((r) => ({
            kind: "collection",
            ...r,
        }));
    } else {
        // Inside a collection: sub-collections placed here
        const rows = await db
            .select({
                id: collections.id,
                title: collections.title,
                createdAt: collections.createdAt,
                updatedAt: collections.updatedAt,
                visibility: collections.visibility,
                itemCount: collections.itemCount,
                role: collectionMembers.role,
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
                    eq(collectionMembers.userId, user.id),
                ),
            )
            .where(
                and(
                    eq(
                        collectionPlacements.contextType,
                        PlacementContext.COLLECTION,
                    ),
                    eq(collectionPlacements.contextId, collectionId),
                ),
            )
            .orderBy(collectionOrder(sort, order));

        rawCollections = rows.map((r) => ({ kind: "collection", ...r }));
    }

    // ── Artworks (paginated) ──────────────────────────────────────────────────
    const buildArtworkWhere = (extra?: ReturnType<typeof and>) => {
        const clauses = [extra].filter(Boolean) as Parameters<typeof and>;
        if (visibility === "public")
            clauses.push(eq(artworks.visibility, "public"));
        else if (visibility === "private")
            clauses.push(eq(artworks.visibility, "private"));
        return clauses.length ? and(...clauses) : undefined;
    };

    let rawArtworks: ArtworkWorkspaceItem[] = [];
    let artworkTotal = 0;

    if (!collectionId) {
        const where = buildArtworkWhere(eq(artworks.userId, user.id));

        const [{ total }] = await db
            .select({ total: count() })
            .from(artworks)
            .where(where);
        artworkTotal = total;

        const rows = await db
            .select()
            .from(artworks)
            .where(where)
            .orderBy(artworkOrder(sort, order))
            .limit(limit)
            .offset(offset);

        rawArtworks = rows.map((a) => ({
            kind: "artwork",
            id: a.id,
            title: a.title,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
            visibility: a.visibility,
            url: a.url,
            r2Key: a.r2Key,
            width: a.width ?? null,
            height: a.height ?? null,
            protectionStatus: a.protectionStatus,
            mediaType: "image",
        }));
    } else {
        const base = eq(collectionItems.collectionId, collectionId);
        const visWhere =
            visibility === "all"
                ? base
                : and(base, eq(artworks.visibility, visibility));

        const [{ total }] = await db
            .select({ total: count() })
            .from(collectionItems)
            .innerJoin(artworks, eq(collectionItems.artworkId, artworks.id))
            .where(visWhere);
        artworkTotal = total;

        const orderClause =
            sort === "createdAt" && order === "desc"
                ? asc(collectionItems.position) // respect manual order by default
                : artworkOrder(sort, order);

        const rows = await db
            .select({ artwork: artworks })
            .from(collectionItems)
            .innerJoin(artworks, eq(collectionItems.artworkId, artworks.id))
            .where(visWhere)
            .orderBy(orderClause)
            .limit(limit)
            .offset(offset);

        rawArtworks = rows.map(({ artwork: a }) => ({
            kind: "artwork",
            id: a.id,
            title: a.title,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
            visibility: a.visibility,
            url: a.url,
            r2Key: a.r2Key,
            width: a.width ?? null,
            height: a.height ?? null,
            protectionStatus: a.protectionStatus,
            mediaType: "image",
        }));
    }

    return {
        collections: rawCollections,
        artworks: rawArtworks,
        hasMore: offset + rawArtworks.length < artworkTotal,
        artworkTotal,
    };
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
