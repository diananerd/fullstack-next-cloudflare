"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import {
    ProtectionMethod,
    type ProtectionMethodType,
    ProtectionStatus,
} from "@/modules/artworks/models/artwork.enum";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { getProtectionConfig } from "@/lib/protection-config";

const DASHBOARD_ROUTE = "/artworks";

export type ProtectArtworkInput = {
    artworkId: number;
    method: ProtectionMethodType;
    config?: Record<string, any>;
};

export async function protectArtworkAction(input: ProtectArtworkInput) {
    try {
        console.log(`[ProtectArtworkAction] Initiating protection for ID ${input.artworkId} with method ${input.method}`);
        const user = await requireAuth();

        // 1. Fetch artwork to verify ownership and get URL
        const db = await getDb();
        const artwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, input.artworkId),
        });

        if (!artwork) {
            return { success: false, error: "Artwork not found" };
        }

        if (artwork.userId !== user.id) {
            return { success: false, error: "Unauthorized access to this artwork" };
        }

        // 2. Prepare Config
        const targetMethod = input.method;
        const protectionConfig = getProtectionConfig(targetMethod);
        const methodConfig = { ...protectionConfig.defaultConfig, ...(input.config || {}) };

        const modalUrl = protectionConfig.url;
        const modalToken = protectionConfig.token;

        if (!modalUrl || !modalToken) {
            throw new Error(
                `Configuration missing for method ${targetMethod}. Please check server configuration.`,
            );
        }

        // 3. Define the Dispatch Task (Background or Foreground)
        const dispatchTask = async () => {
            try {
                console.log(
                    `[ProtectArtworkAction] Dispatching ${targetMethod} for ID ${input.artworkId}`,
                );

                const payload = {
                    artwork_id: String(input.artworkId),
                    user_id: user.id,
                    image_url: artwork.url,
                    method: targetMethod,
                    config: methodConfig,
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
                    `[ProtectArtworkAction] Job Dispatched. Job ID: ${responseData.job_id}`,
                );

                // Update DB: Status -> PROCESSING (Since we got a job ID directly)
                // If we wanted QUEUED, we'd set it before fetch, and PROCESSING here. 
                // But simplified flow: Action -> PROCESSING is fine if fast.
                // However, user requested QUEUED exists when solicited but no response.
                // Since this is a server action, the "QUEUED" state is effectively the duration of this fetch.
                // To make it visible, we can set QUEUED before fetch? 
                // But D1 writes might be slower than the fetch.
                // Let's stick to setting PROCESSING here as it confirms the job started.
                
                const db = await getDb();
                await db
                    .update(artworks)
                    .set({
                        protectionStatus: ProtectionStatus.PROCESSING,
                        method: targetMethod, // Update method if changed
                        jobId: responseData.job_id,
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(artworks.id, input.artworkId));
            } catch (e) {
                console.error(
                    `[ProtectArtworkAction] Background Dispatch ERROR:`,
                    e,
                );
                try {
                    const db = await getDb();
                    await db
                        .update(artworks)
                        .set({
                            protectionStatus: ProtectionStatus.FAILED,
                            metadata: { error: String(e) },
                            updatedAt: new Date().toISOString(),
                        })
                        .where(eq(artworks.id, input.artworkId));
                } catch (dbErr) {
                    console.error("Failed to mark job as FAILED", dbErr);
                }
            }
        };

        // 4. Update Status to QUEUED immediately to give feedback
        await db
            .update(artworks)
            .set({
                protectionStatus: ProtectionStatus.QUEUED,
                updatedAt: new Date().toISOString(),
            })
            .where(eq(artworks.id, input.artworkId));

        // 5. Execute Dispatch (Background preferred)
        try {
            const { ctx } = await getCloudflareContext();
            if (ctx && typeof ctx.waitUntil === "function") {
                console.log(`[ProtectArtworkAction] Offloading dispatch to waitUntil`);
                ctx.waitUntil(dispatchTask());
            } else {
                // Fallback for local
                // In local dev without full workerd emulation, await it to ensure it runs
                // Or fire and forget without await if we trust it won't be killed
                // Ideally, we await it here for dev experience, users can wait 1-2s for the dispatch.
                await dispatchTask(); 
            }
        } catch (ctxErr) {
             await dispatchTask();
        }

        revalidatePath(DASHBOARD_ROUTE);
        return { success: true };

    } catch (error) {
        console.error(`[ProtectArtworkAction] Error:`, error);
        return {
            success: false,
            error: (error as Error).message || "Failed to initiate protection",
        };
    }
}
