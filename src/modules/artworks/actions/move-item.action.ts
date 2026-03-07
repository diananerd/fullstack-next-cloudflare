"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { workspaceItems } from "@/modules/artworks/schemas/workspace-item.schema";
import { requireAuth } from "@/modules/auth/utils/auth-utils";

/** Move any workspace item (artwork or collection) to a new parent (or root). */
export async function moveWorkspaceItemAction(
    itemId: string,
    toCollectionId: string | null,
) {
    const user = await requireAuth();
    const db = await getDb();

    const [item] = await db
        .select({
            userId: workspaceItems.userId,
            parentId: workspaceItems.parentId,
        })
        .from(workspaceItems)
        .where(eq(workspaceItems.id, itemId))
        .limit(1);

    if (!item || item.userId !== user.id) {
        return { success: false, error: "Not authorized" };
    }

    if (item.parentId === toCollectionId) return { success: true };

    // Decrement old parent itemCount
    if (item.parentId) {
        await db
            .update(workspaceItems)
            .set({
                itemCount: sql`max(0, item_count - 1)`,
                updatedAt: new Date().toISOString(),
            })
            .where(eq(workspaceItems.id, item.parentId));
    }

    // Move item
    await db
        .update(workspaceItems)
        .set({ parentId: toCollectionId, updatedAt: new Date().toISOString() })
        .where(eq(workspaceItems.id, itemId));

    // Increment new parent itemCount
    if (toCollectionId) {
        await db
            .update(workspaceItems)
            .set({
                itemCount: sql`item_count + 1`,
                updatedAt: new Date().toISOString(),
            })
            .where(eq(workspaceItems.id, toCollectionId));
    }

    revalidatePath("/artworks");
    return { success: true };
}

// Legacy compatibility aliases
export async function moveArtworkAction(
    artworkId: string,
    fromCollectionId: string | null,
    toCollectionId: string | null,
) {
    return moveWorkspaceItemAction(artworkId, toCollectionId);
}

export async function moveCollectionAction(
    collectionId: string,
    toCollectionId: string | null,
) {
    return moveWorkspaceItemAction(collectionId, toCollectionId);
}
