"use server";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";

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
    } catch (error: any) {
        console.error("Get artworks error:", error);
        return { success: false, error: `Failed to fetch artworks: ${error.message} - ${JSON.stringify(error)}` };
    }
}
