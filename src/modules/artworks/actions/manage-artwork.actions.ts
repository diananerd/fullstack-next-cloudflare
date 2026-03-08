"use server";

import { and, eq, getTableColumns } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { deleteFromR2, deleteFolderFromR2 } from "@/lib/r2";
import { ProtectionStatus } from "@/modules/artworks/models/artwork.enum";
import { entities } from "@/modules/artworks/schemas/entity.schema";
import { workspaceItems as artworkData } from "@/modules/artworks/schemas/workspace-item.schema";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { PipelineService } from "../services/pipeline.service";

const DASHBOARD_ROUTE = "/artworks";

async function getArtwork(artworkId: string) {
    const db = await getDb();
    const [row] = await db
        .select({
            ...getTableColumns(entities),
            ...getTableColumns(artworkData),
            userId: entities.createdBy,
        })
        .from(entities)
        .innerJoin(artworkData, eq(artworkData.id, entities.id))
        .where(and(eq(entities.id, artworkId), eq(entities.type, "artwork")))
        .limit(1);
    return row ?? null;
}

export async function deleteArtworkAction(artworkId: string) {
    try {
        const user = await requireAuth();
        const db = await getDb();

        const artwork = await getArtwork(artworkId);

        if (!artwork) return { success: false, error: "Artwork not found" };
        if (artwork.userId !== user.id)
            return { success: false, error: "Unauthorized" };

        if (artwork.r2Key) {
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

        // Deleting from entities cascades to artworkData + all FK tables
        await db.delete(entities).where(eq(entities.id, artworkId));

        revalidatePath(DASHBOARD_ROUTE);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function cancelProtectionAction(artworkId: string) {
    try {
        const user = await requireAuth();
        const db = await getDb();

        const artwork = await getArtwork(artworkId);

        if (!artwork) return { success: false, error: "Artwork not found" };
        if (artwork.userId !== user.id)
            return { success: false, error: "Unauthorized" };

        await db
            .update(artworkData)
            .set({ protectionStatus: ProtectionStatus.CANCELED, jobId: null })
            .where(eq(artworkData.id, artworkId));

        revalidatePath(DASHBOARD_ROUTE);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function retryProtectionAction(artworkId: string) {
    try {
        const user = await requireAuth();

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
