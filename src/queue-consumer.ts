import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { uploadToR2, deleteFromR2 } from "./lib/r2";
import { ProtectionStatus } from "./modules/artworks/models/artwork.enum";
import { artworks } from "./modules/artworks/schemas/artwork.schema";

export interface QueueMessage {
    type: "PROCESS_ARTWORK";
    payload: {
        artworkId: number;
        fileUrl: string;
    };
}

export async function queueHandler(batch: MessageBatch<QueueMessage>, env: CloudflareEnv): Promise<void> {
    console.log(`Processing batch of ${batch.messages.length} messages`);
    
    // Initialize services that might need env
    const db = await getDb(env as unknown as Cloudflare.Env);

    for (const message of batch.messages) {
        try {
            if (message.body.type === "PROCESS_ARTWORK") {
                await processArtwork(message.body.payload, env, db);
            }
            message.ack();
        } catch (error) {
            console.error("Failed to process message", error);
            message.retry();
        }
    }
}

async function processArtwork(
    { artworkId, fileUrl }: { artworkId: number; fileUrl: string },
    env: CloudflareEnv,
    db: any
) {
    console.log(`[QueueWorker] Starting protection for ${artworkId} (${fileUrl})`);

    try {
        // 1. Set Status to PROCESSING (redundant if already set by API, but good for safety)
        // Skip this since API sets it, or do it to be sure.
        
        // Simulate processing delay
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // FETCH the raw image bytes
        const response = await fetch(fileUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch raw image: ${response.statusText}`);
        }
        const blob = await response.blob();

        // Extract filename logic
        const urlPath = new URL(fileUrl).pathname;
        const originalFileName = urlPath.split("/").pop() || `artwork_${artworkId}.png`;
        const fileHashName = originalFileName.substring(0, originalFileName.lastIndexOf(".")) || "unknown_hash";

        const file = new File([blob], originalFileName, { type: blob.type });

        // UPLOAD protected version
        const uploadResult = await uploadToR2(file, "protected", fileHashName, env as unknown as Cloudflare.Env);

        if (!uploadResult.success || !uploadResult.key || !uploadResult.url) {
            throw new Error("Failed to upload protected image to R2");
        }

        console.log(`[QueueWorker] Uploaded protected version to ${uploadResult.key}`);

        // DB Update
        const currentArtwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
        });

        if (currentArtwork?.protectionStatus === ProtectionStatus.CANCELED) {
             console.log(`[QueueWorker] Job for ${artworkId} was canceled. Cleaning up.`);
             if (uploadResult.key) await deleteFromR2(uploadResult.key, env as unknown as Cloudflare.Env);
             return;
        }

        await db
            .update(artworks)
            .set({
                protectionStatus: ProtectionStatus.PROTECTED,
                protectedR2Key: uploadResult.key,
                protectedUrl: uploadResult.url,
                updatedAt: new Date().toISOString(),
            })
            .where(eq(artworks.id, artworkId));
            
        console.log(`[QueueWorker] Job complete for ${artworkId}`);

    } catch (error: any) {
        console.error(`[QueueWorker] Error processing ${artworkId}:`, error);
        
        try {
             await db
                .update(artworks)
                .set({
                    protectionStatus: ProtectionStatus.FAILED,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(artworks.id, artworkId));
        } catch (dbErr) {
            console.error("[QueueWorker] Failed to update DB to FAILED", dbErr);
        }
        // Don't rethrow if we've determined it's a hard failure handled by DB update.
        // However, if we want random networkjitters to retry... 
        // For this mock demo, let's treat it as handled so we don't spam retries.
    }
}
