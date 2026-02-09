"use server";

import { and, count, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { deleteFromR2 } from "@/lib/r2";
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

        // File cleanup (Direct R2 Delete)
        if (shouldDeleteRaw && artwork.r2Key) {
            await deleteFromR2(artwork.r2Key);
            console.log(`[Delete] Deleted raw file: ${artwork.r2Key}`);
        }
        if (shouldDeleteProtected && artwork.protectedR2Key) {
            await deleteFromR2(artwork.protectedR2Key);
            console.log(
                `[Delete] Deleted protected file: ${artwork.protectedR2Key}`,
            );
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

        // Set back to QUEUED
        await db
            .update(artworks)
            .set({
                protectionStatus: ProtectionStatus.QUEUED,
                updatedAt: new Date().toISOString(),
            })
            .where(eq(artworks.id, artworkId));

        console.log(`[Retry] Resubmitting artwork ${artworkId} to Modal...`);

        // Resubmit to Modal
        try {
            const modalUrl = process.env.MODAL_API_URL;
            const modalToken = process.env.MODAL_AUTH_TOKEN;

            if (!modalUrl || !modalToken) {
                throw new Error(
                    "System Configuration Error: Protection Service Unavailable (Missing Config)",
                );
            }

            const payload = {
                artwork_id: String(artworkId),
                user_id: user.id,
                image_url: artwork.url,
                method: "mist",
                config: { steps: 3, epsilon: 0.0627 },
            };

            const modalResponse = await fetch(modalUrl, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${modalToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (!modalResponse.ok) {
                const errText = await modalResponse.text();
                throw new Error(
                    `Protection Service Failed (${modalResponse.status}): ${errText}`,
                );
            }

            const responseData = (await modalResponse.json()) as any;
            console.log(
                `[Retry] Job Dispatched. Job ID: ${responseData.job_id}`,
            );

            // Update Job ID
            await db
                .update(artworks)
                .set({
                    protectionStatus: ProtectionStatus.PROCESSING,
                    jobId: responseData.job_id,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(artworks.id, artworkId));
        } catch (submitErr) {
            console.error("[Retry] Submission Failed:", submitErr);
            await db
                .update(artworks)
                .set({
                    protectionStatus: ProtectionStatus.FAILED,
                    metadata: { error: String(submitErr) },
                })
                .where(eq(artworks.id, artworkId));
            return { success: false, error: "Submission to backend failed." };
        }

        revalidatePath(DASHBOARD_ROUTE);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
