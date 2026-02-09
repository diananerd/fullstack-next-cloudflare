"use server";

import { and, count, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { deleteFolderFromR2, deleteFromR2 } from "@/lib/r2";
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
            `[Delete] v2 Processing delete for ID ${artworkId}. R2: ${artwork.r2Key}`,
        );

        // Safe Deletion: Check if R2 items are used by OTHER artworks before deleting
        let shouldDelete = true;

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
                shouldDelete = false;
            }
        }

        // Delete from DB first
        await db.delete(artworks).where(eq(artworks.id, artworkId));

        // File cleanup (Direct R2 Delete)
        if (shouldDelete && artwork.r2Key) {
            const parts = artwork.r2Key.split("/");
            // Expectation: {hash}/original.{extension}
            // 1. General Deletion: Borra el directorio completo (hash) y todas sus variantes
            if (parts.length > 1) {
                const rootHash = parts[0];
                await deleteFolderFromR2(`${rootHash}/`);
                console.log(`[Delete] Deleted art folder: ${rootHash}/`);
            }
        }

        revalidatePath(DASHBOARD_ROUTE);
        return { success: true };
    } catch (error: any) {
        console.error("Delete Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Borra una variante específica del artwork (ej: "mist-v2.png"), manteniendo el resto.
 */
export async function deleteArtworkVariantAction(
    artworkId: number,
    variantName: string,
) {
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
            const parts = artwork.r2Key.split("/");
            if (parts.length > 1) {
                const rootHash = parts[0];
                // 2. Specific variant deletion: Borra solo el archivo indicado
                const variantKey = `${rootHash}/${variantName}`;
                await deleteFromR2(variantKey);
                console.log(`[Delete] Deleted variant: ${variantKey}`);
            }
        }

        return { success: true };
    } catch (error: any) {
        console.error("Delete Variant Error:", error);
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
            // User requested final states only FAILED or DONE.
            // Reset to DONE (Initial) so it's ready to handle again.
            .set({ protectionStatus: ProtectionStatus.DONE, jobId: null }) 
            .where(eq(artworks.id, artworkId));

        revalidatePath(DASHBOARD_ROUTE);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

import { getProtectionConfig } from "@/lib/protection-config";

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
            const targetMethod = artwork.method || "mist";
            const protectionConfig = getProtectionConfig(targetMethod);
            
            const modalUrl = protectionConfig.url;
            const modalToken = protectionConfig.token;

            if (!modalUrl || !modalToken) {
                throw new Error(
                    `System Configuration Error: Protection Service Unavailable for method ${targetMethod}`,
                );
            }

            const payload = {
                artwork_id: String(artworkId),
                user_id: user.id,
                image_url: artwork.url,
                method: targetMethod,
                config: protectionConfig.defaultConfig || {},
                is_preview: process.env.NODE_ENV !== "production",
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
