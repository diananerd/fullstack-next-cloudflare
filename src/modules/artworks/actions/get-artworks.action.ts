"use server";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { requireAuth } from "@/modules/auth/utils/auth-utils";

export async function getArtworksAction() {
    try {
        const user = await requireAuth();
        const db = await getDb();

        const data = await db
            .select()
            .from(artworks)
            .where(eq(artworks.userId, user.id))
            .orderBy(desc(artworks.createdAt));

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
