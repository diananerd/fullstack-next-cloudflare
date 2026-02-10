"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { deleteFromR2, deleteFolderFromR2 } from "@/lib/r2";
import { ProtectionStatus } from "@/modules/artworks/models/artwork.enum";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { PipelineService } from "../services/pipeline.service";

const DASHBOARD_ROUTE = "/artworks";

export async function deleteArtworkAction(artworkId: number) {
    try {
        const user = await requireAuth();
        const db = await getDb();

        const artwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
        });

        if (!artwork) return { success: false, error: "Artwork not found" };
        if (artwork.userId !== user.id)
            return { success: false, error: "Unauthorized" };

        if (artwork.r2Key) {
            // Check if key is in a folder (Deep Clean)
            // Expecting format: "{userId}/{hash}/original.png"
            // We want to delete "{userId}/{hash}" folder.

            const lastSlashIndex = artwork.r2Key.lastIndexOf("/");
            if (lastSlashIndex !== -1) {
                const folderPath = artwork.r2Key.substring(0, lastSlashIndex);
                console.log(`[DeleteArtwork] Deleting folder: ${folderPath}`);
                await deleteFolderFromR2(folderPath);
            } else {
                console.log(
                    `[DeleteArtwork] Deleting single file (legacy?): ${artwork.r2Key}`,
                );
                await deleteFromR2(artwork.r2Key);
            }
        }

        await db.delete(artworks).where(eq(artworks.id, artworkId));

        revalidatePath(DASHBOARD_ROUTE);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function cancelProtectionAction(artworkId: number) {
    try {
        const user = await requireAuth();
        const db = await getDb();

        const artwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
        });

        if (!artwork) return { success: false, error: "Artwork not found" };
        if (artwork.userId !== user.id)
            return { success: false, error: "Unauthorized" };

        // We can't easily cancel a running Modal job without an API call to Modal (not implemented yet).
        // But we can stop our pipeline from proceeding.

        await db
            .update(artworks)
            .set({ protectionStatus: ProtectionStatus.DONE, jobId: null })
            .where(eq(artworks.id, artworkId));

        revalidatePath(DASHBOARD_ROUTE);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function retryProtectionAction(artworkId: number) {
    try {
        const user = await requireAuth();

        // Delegate to centralized Pipeline Service
        await PipelineService.resumePipeline(artworkId, user.id);

        revalidatePath(DASHBOARD_ROUTE);
        return { success: true };
    } catch (error: any) {
        console.error("Retry Action Failed:", error);
        return {
            success: false,
            error: error.message || "Failed to retry protection",
        };
    }
}
