"use server";

import { desc, eq, getTableColumns } from "drizzle-orm";
import { getDb } from "@/db";
import { entities } from "@/modules/artworks/schemas/entity.schema";
import { workspaceItems as artworkData } from "@/modules/artworks/schemas/workspace-item.schema";
import { requireAuth } from "@/modules/auth/utils/auth-utils";

export async function getArtworksAction() {
    try {
        const user = await requireAuth();
        const db = await getDb();

        const data = await db
            .select({
                ...getTableColumns(entities),
                ...getTableColumns(artworkData),
                userId: entities.createdBy,
            })
            .from(entities)
            .innerJoin(artworkData, eq(artworkData.id, entities.id))
            .where(eq(entities.createdBy, user.id))
            .orderBy(desc(entities.createdAt));

        return { success: true, data };
    } catch (error: unknown) {
        console.error("Get artworks error:", error);
        return {
            success: false,
            // biome-ignore lint/suspicious/noExplicitAny: Error message extraction
            error: `Failed to fetch artworks: ${(error as any).message} - ${JSON.stringify(error)}`,
        };
    }
}
