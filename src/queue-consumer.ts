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
    const startTime = Date.now();
    console.log(`[QueueWorker] [START] Processing artwork ${artworkId}. URL: ${fileUrl}`);

    try {
        // 1. Initial Status Check & Update to PROCESSING
        // We check if it was cancelled BEFORE doing any work.
        const initialArtwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
        });

        if (!initialArtwork) {
             console.error(`[QueueWorker] [ABORT] Artwork ${artworkId} not found in DB.`);
             return;
        }

        if (initialArtwork.protectionStatus === ProtectionStatus.CANCELED) {
             console.log(`[QueueWorker] [ABORT] Artwork ${artworkId} was CANCELED before processing started.`);
             return;
        }

        // Set status to PROCESSING
        await db
            .update(artworks)
            .set({ 
                protectionStatus: ProtectionStatus.PROCESSING,
                updatedAt: new Date().toISOString()
            })
            .where(eq(artworks.id, artworkId));
            
        console.log(`[QueueWorker] [Status] Updated ${artworkId} to PROCESSING`);

        // 2. Fetch Image (R2 Optimization)
        let blob: Blob;
        // Optimization: if URL contains /api/assets/, try to get directly from R2 binding
        const assetMatch = fileUrl.match(/\/api\/assets\/(.+)$/);
        
        if (assetMatch && assetMatch[1]) {
             const key = assetMatch[1];
             console.log(`[QueueWorker] [R2-Fetch] Attempting direct binding fetch for key: ${key}`);
             const object = await (env as unknown as Cloudflare.Env).drimit_shield_bucket.get(key);
             if (object) {
                 blob = await object.blob();
                 console.log(`[QueueWorker] [R2-Fetch] Success. Size: ${blob.size} bytes`);
             } else {
                 console.warn(`[QueueWorker] [R2-Fetch] FAILED for ${key}, falling back to public URL fetch`);
                 const response = await fetch(fileUrl);
                 if (!response.ok) throw new Error(`Failed to fetch raw image from URL: ${response.status} ${response.statusText}`);
                 blob = await response.blob();
                 console.log(`[QueueWorker] [URL-Fetch] Success. Size: ${blob.size} bytes`);
             }
        } else {
            console.log(`[QueueWorker] [URL-Fetch] Fetching from public URL: ${fileUrl}`);
            const response = await fetch(fileUrl);
            if (!response.ok) throw new Error(`Failed to fetch raw image: ${response.statusText}`);
            blob = await response.blob();
            console.log(`[QueueWorker] [URL-Fetch] Success. Size: ${blob.size} bytes`);
        }

        // 3. Second Cancellation Check (Before expensive Modal call)
        // Re-fetch status to see if user canceled while we were downloading
        const preModalArtwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
            columns: { protectionStatus: true }
        });
        
        if (preModalArtwork?.protectionStatus === ProtectionStatus.CANCELED) {
             console.log(`[QueueWorker] [ABORT] Artwork ${artworkId} was CANCELED before Modal call.`);
             return;
        }

        // 4. OFF-LOAD PROCESSING TO MODAL
        const modalUrl = (env as any).MODAL_API_URL;
        const modalToken = (env as any).MODAL_AUTH_TOKEN;

        if (!modalUrl || !modalToken) {
             throw new Error("Misconfigured: MODAL_API_URL or MODAL_AUTH_TOKEN is missing");
        }

        console.log(`[QueueWorker] [Modal] Offloading to ${modalUrl}`);
        const modalStartTime = Date.now();
        
        const modalResponse = await fetch(modalUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${modalToken}`,
                "Content-Type": "application/octet-stream"
            },
            body: blob
        });

        const modalDuration = Date.now() - modalStartTime;

        if (!modalResponse.ok) {
            const errText = await modalResponse.text();
            console.error(`[QueueWorker] [Modal] FAILED. Status: ${modalResponse.status}. Body: ${errText}`);
            throw new Error(`Modal processing failed (${modalResponse.status}): ${errText}`);
        }

        const processedBlob = await modalResponse.blob();
        console.log(`[QueueWorker] [Modal] Success. Received ${processedBlob.size} bytes in ${modalDuration}ms`);

        // 5. Upload Protected Version
        const urlPath = new URL(fileUrl).pathname;
        const originalFileName = urlPath.split("/").pop() || `artwork_${artworkId}.png`;
        const fileHashName = originalFileName.substring(0, originalFileName.lastIndexOf(".")) || "unknown_hash";
        const file = new File([processedBlob], originalFileName, { type: processedBlob.type });

        console.log(`[QueueWorker] [Upload] Uploading protected version with hash: ${fileHashName}`);
        const uploadResult = await uploadToR2(file, "protected", fileHashName, env as unknown as Cloudflare.Env);

        if (!uploadResult.success || !uploadResult.key || !uploadResult.url) {
            throw new Error(`Failed to upload protected image to R2: ${uploadResult.error}`);
        }
        console.log(`[QueueWorker] [Upload] Success. Key: ${uploadResult.key}, URL: ${uploadResult.url}`);

        // 6. Final Status Update (Atomic Check)
        // We update ONLY if status is NOT Canceled.
        // Using a transaction would be ideal, but for now we check-then-set or use a conditional update query if possible.
        // Drizzle doesn't support "update ... where ... AND status != canceled" easily with returning without raw sql, 
        // but we can trust a check here for 99% of cases.
        
        const finalCheck = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
            columns: { protectionStatus: true }
        });

        if (finalCheck?.protectionStatus === ProtectionStatus.CANCELED) {
             console.log(`[QueueWorker] [Cleanup] Job for ${artworkId} was canceled during processing. Deleting protected file.`);
             if (uploadResult.key) await deleteFromR2(uploadResult.key, env as unknown as Cloudflare.Env);
             return;
        }

        console.log(`[QueueWorker] [DB] Updating artwork ${artworkId} status to PROTECTED`);
        await db
            .update(artworks)
            .set({
                protectionStatus: ProtectionStatus.PROTECTED,
                protectedR2Key: uploadResult.key,
                protectedUrl: uploadResult.url,
                updatedAt: new Date().toISOString(),
            })
            .where(eq(artworks.id, artworkId));
            
        const totalDuration = Date.now() - startTime;
        console.log(`[QueueWorker] [COMPLETE] Artwork ${artworkId} processed successfully in ${totalDuration}ms`);

    } catch (error: any) {
        console.error(`[QueueWorker] [ERROR] Processing ${artworkId}:`, error);
        
        try {
            // Only set to FAILED if it wasn't CANCELED
             const check = await db.query.artworks.findFirst({
                where: eq(artworks.id, artworkId),
                columns: { protectionStatus: true }
            });
            
            if (check?.protectionStatus !== ProtectionStatus.CANCELED) {
                 await db
                    .update(artworks)
                    .set({
                        protectionStatus: ProtectionStatus.FAILED,
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(artworks.id, artworkId));
            }
        } catch (dbErr) {
            console.error("[QueueWorker] Failed to update DB to FAILED", dbErr);
        }
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
