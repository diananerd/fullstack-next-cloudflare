"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import {
    queryCollectionItems,
    queryRootItems,
    resolveCollectionPath as resolveCollectionPathQuery,
} from "./workspace-nodes.query";
import type {
    WorkspaceItemsResult,
    WorkspaceQuery,
} from "@/modules/artworks/models/workspace-item.model";

export async function getWorkspaceItemsAction(
    query: WorkspaceQuery,
): Promise<WorkspaceItemsResult> {
    const user = await requireAuth();
    const db = await getDb();
    const { collectionId, visibility } = query;

    const ownerFilter = eq(nodes.createdBy, user.id);
    const visibilityFilter =
        visibility !== "all" ? eq(nodes.visibility, visibility) : undefined;

    const scope = {
        ownerFilter,
        visibilityFilter,
        collectionRole: "owner",
    };

    if (collectionId) {
        return queryCollectionItems(db, collectionId, query, scope);
    }
    return queryRootItems(db, query, scope);
}

// ── Breadcrumb ancestor resolution ───────────────────────────────────────────
// Exported from here for backward compatibility (WorkspaceBreadcrumb imports it).

export async function resolveCollectionPath(
    collectionId: string,
): Promise<{ id: string; title: string }[]> {
    const db = await getDb();
    return resolveCollectionPathQuery(db, collectionId);
}
