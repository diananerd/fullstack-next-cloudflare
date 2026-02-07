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
            userId: string;
            fileUrl: string;
        };
      }
    | {
        type: "DELETE_ARTWORK_FILES";
        payload: {
            r2Key?: string | null;
            protectedR2Key?: string | null;
            artworkId?: number; // Optional context
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
    { artworkId, userId, fileUrl }: { artworkId: number; userId: string; fileUrl: string },
    env: CloudflareEnv,
    db: any
) {
    const startTime = Date.now();
    console.log(`[QueueWorker] [START] Dispatching artwork ${artworkId} to Modal.`);

    try {
        // 1. Initial Status Check
        const initialArtwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
        });

        if (!initialArtwork) {
             console.error(`[QueueWorker] [ABORT] Artwork ${artworkId} not found in DB.`);
             return;
        }

        if (initialArtwork.protectionStatus === ProtectionStatus.CANCELED) {
             console.log(`[QueueWorker] [ABORT] Artwork ${artworkId} was CANCELED.`);
             return;
        }

        // 2. Prepare Modal Request
        const modalUrl = (env as any).MODAL_API_URL;
        const modalToken = (env as any).MODAL_AUTH_TOKEN;

        if (!modalUrl || !modalToken) {
             throw new Error("Misconfigured: MODAL_API_URL or MODAL_AUTH_TOKEN is missing");
        }

        const callbackSecret = (env as any).MODAL_CALLBACK_SECRET;
        const appUrl = (env as any).BETTER_AUTH_URL || "https://shield.drimit.io"; 
        const callbackUrl = `${appUrl}/api/webhooks/modal`;

        const payload = {
            artwork_id: String(artworkId),
            user_id: userId || "unknown",
            image_url: fileUrl || "",
            config: {
                steps: 3, 
                epsilon: 0.0627
            },
            callback_url: callbackUrl,
            webhook_secret: callbackSecret
        };

        console.log(`[QueueWorker] [Modal] Sending request to ${modalUrl}`);
        console.log(`[QueueWorker] [Modal] Payload: ${JSON.stringify(payload)}`);
        
        const modalResponse = await fetch(modalUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${modalToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!modalResponse.ok) {
            const errText = await modalResponse.text();
            throw new Error(`Modal dispatch failed (${modalResponse.status}): ${errText}`);
        }

        const responseData = await modalResponse.json() as any;
        console.log(`[QueueWorker] [Modal] Dispatched. Job ID: ${responseData.job_id}`);

        // 3. Update DB with Job ID and RUNNING status
        await db
            .update(artworks)
            .set({ 
                protectionStatus: ProtectionStatus.RUNNING,
                jobId: responseData.job_id,
                updatedAt: new Date().toISOString()
            })
            .where(eq(artworks.id, artworkId));
            
        console.log(`[QueueWorker] [COMPLETE] Artwork ${artworkId} dispatched successfully.`);

    } catch (error: any) {
        console.error(`[QueueWorker] [ERROR] Dispatching ${artworkId}:`, error);
        
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
