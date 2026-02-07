import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { uploadToR2, deleteFromR2 } from "./lib/r2";
import { ProtectionStatus } from "./modules/artworks/models/artwork.enum";
import { artworks } from "./modules/artworks/schemas/artwork.schema";

export type QueueMessage = 
    | {
        type: "PROCESS_ARTWORK";
        payload: {
            artworkId: number;
            fileUrl: string;
        };
      }
    | {
        type: "DELETE_ARTWORK_FILES";
        payload: {
            r2Key?: string | null;
            protectedR2Key?: string | null;
        };
      };

export async function queueHandler(batch: MessageBatch<QueueMessage>, env: CloudflareEnv): Promise<void> {
    console.log(`Processing batch of ${batch.messages.length} messages`);
    
    // Initialize services that might need env
    const db = await getDb(env as unknown as Cloudflare.Env);

    for (const message of batch.messages) {
        try {
            switch (message.body.type) {
                case "PROCESS_ARTWORK":
                    await processArtwork(message.body.payload, env, db);
                    break;
                case "DELETE_ARTWORK_FILES":
                    await deleteArtworkFiles(message.body.payload, env);
                    break;
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

        let blob: Blob;
        
        // Optimization: if URL contains /api/assets/, try to get directly from R2 binding
        // to avoid authentication issues (worker doesn't have session cookies) and network overhead.
        const assetMatch = fileUrl.match(/\/api\/assets\/(.+)$/);
        
        if (assetMatch && assetMatch[1]) {
             const key = assetMatch[1];
             console.log(`[QueueWorker] Fetching from R2 binding: ${key}`);
             const object = await (env as unknown as Cloudflare.Env).drimit_shield_bucket.get(key);
             if (object) {
                 blob = await object.blob();
             } else {
                 // Try fetch fallback if R2 lookup fails but maybe URL works (unlikely for internal)
                 console.warn(`[QueueWorker] R2 get failed for ${key}, falling back to fetch`);
                 const response = await fetch(fileUrl);
                 if (!response.ok) throw new Error(`Failed to fetch raw image: ${response.statusText}`);
                 blob = await response.blob();
             }
        } else {
            // FETCH the raw image bytes via URL
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch raw image: ${response.statusText}`);
            }
            blob = await response.blob();
        }

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

async function deleteArtworkFiles(
    payload: { r2Key?: string | null; protectedR2Key?: string | null },
    env: CloudflareEnv
) {
    const { r2Key, protectedR2Key } = payload;
    console.log(`[QueueWorker] Deleting files: Raw=${r2Key}, Protected=${protectedR2Key}`);

    if (r2Key) {
        await deleteFromR2(r2Key, env as unknown as Cloudflare.Env);
    }
    if (protectedR2Key) {
        await deleteFromR2(protectedR2Key, env as unknown as Cloudflare.Env);
    }
}
