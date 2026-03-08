"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import {
    queryCollectionItems,
    queryRootItems,
} from "@/modules/artworks/actions/workspace-nodes.query";
import type {
    WorkspaceItemsResult,
    WorkspaceQuery,
} from "@/modules/artworks/models/workspace-item.model";

export async function getPublicWorkspaceItemsAction(
    ownerUserId: string,
    query: WorkspaceQuery,
): Promise<WorkspaceItemsResult> {
    const db = await getDb();
    const { collectionId } = query;

    const nodeType = query.nodeType ?? "all";
    const nodeTypes =
        nodeType === "artwork"
            ? ["artwork"]
            : nodeType === "board"
              ? ["collection"]
              : ["artwork", "collection"];

    const scope = {
        ownerFilter: eq(nodes.createdBy, ownerUserId),
        visibilityFilter: eq(nodes.visibility, "public"),
        collectionRole: "viewer",
        nodeTypes,
    };

    if (collectionId) {
        return queryCollectionItems(db, collectionId, query, scope);
    }
    return queryRootItems(db, query, scope);
}
