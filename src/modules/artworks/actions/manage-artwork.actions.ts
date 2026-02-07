"use server";

import { and, count, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { sendToQueue } from "@/lib/queue";
import { ProtectionStatus } from "@/modules/artworks/models/artwork.enum";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { requireAuth } from "@/modules/auth/utils/auth-utils";

const DASHBOARD_ROUTE = "/artworks";

export async function deleteArtworkAction(artworkId: number) {
    try {
        const user = await requireAuth();
        const db = await getDb();

        // Check ownership
        const artwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
        });

        if (!artwork) return { success: false, error: "Artwork not found" };
        if (artwork.userId !== user.id)
            return { success: false, error: "Unauthorized" };

        console.log(
            `[Delete] Processing delete for ID ${artworkId}. R2: ${artwork.r2Key}, Protected: ${artwork.protectedR2Key}`,
        );

        // Safe Deletion: Check if R2 items are used by OTHER artworks before deleting
        let shouldDeleteRaw = true;
        let shouldDeleteProtected = true;

        if (artwork.r2Key) {
            const result = await db
                .select({ value: count() })
                .from(artworks)
                .where(
                    and(
                        eq(artworks.r2Key, artwork.r2Key),
                        ne(artworks.id, artworkId),
                    ),
                )
                .get();

            const usageCount = result?.value ?? 0;
            console.log(
                `[Delete] Raw Key ${artwork.r2Key} usage elsewhere: ${usageCount}`,
            );

            if (usageCount > 0) {
                shouldDeleteRaw = false;
            }
        }

        if (artwork.protectedR2Key) {
            const result = await db
                .select({ value: count() })
                .from(artworks)
                .where(
                    and(
                        eq(artworks.protectedR2Key, artwork.protectedR2Key),
                        ne(artworks.id, artworkId),
                    ),
                )
                .get();

            const usageCount = result?.value ?? 0;
            console.log(
                `[Delete] Protected Key ${artwork.protectedR2Key} usage elsewhere: ${usageCount}`,
            );

            if (usageCount > 0) {
                shouldDeleteProtected = false;
            }
        }

        // Delete from DB first
        await db.delete(artworks).where(eq(artworks.id, artworkId));

        // Enqueue file cleanup
        if ((shouldDeleteRaw && artwork.r2Key) || (shouldDeleteProtected && artwork.protectedR2Key)) {
            console.log(`[Delete] Enqueuing file cleanup for ID ${artworkId}`);
            await sendToQueue({
                type: "DELETE_ARTWORK_FILES",
                payload: {
                    r2Key: shouldDeleteRaw ? artwork.r2Key : null,
                    protectedR2Key: shouldDeleteProtected ? artwork.protectedR2Key : null,
                }
            });
        }

        revalidatePath(DASHBOARD_ROUTE);
        return { success: true };
    } catch (error: any) {
        console.error("Delete Error:", error);
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

        await db
            .update(artworks)
            .set({ protectionStatus: ProtectionStatus.CANCELED })
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
        const db = await getDb();

        const artwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
        });

        if (!artwork) return { success: false, error: "Artwork not found" };
        if (artwork.userId !== user.id)
            return { success: false, error: "Unauthorized" };

        // Set back to PENDING and trigger queue
        await db
            .update(artworks)
            .set({ protectionStatus: ProtectionStatus.PENDING })
            .where(eq(artworks.id, artworkId));

        console.log(
            `Re-queuing protection for ID ${artworkId}`,
        );
        
        await sendToQueue({
            type: "PROCESS_ARTWORK",
            payload: {
                artworkId: artworkId,
                fileUrl: artwork.url,
            }
        });

        revalidatePath(DASHBOARD_ROUTE);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
