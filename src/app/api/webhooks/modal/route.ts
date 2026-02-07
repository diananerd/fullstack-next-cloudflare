import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { eq } from "drizzle-orm";
import { ProtectionStatus } from "@/modules/artworks/models/artwork.enum";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Shared type
interface ProtectionResult {
    artwork_id: number | string;
    status: "completed" | "failed";
    original_image_url: string;
    protected_image_url?: string;
    processing_time: number;
    error_message?: string;
    file_metadata?: any;
}

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    console.log("[Webhook] Received callback request");
    
    try {
        // 0. Get Env
        let env: Record<string, any> = process.env;
        try {
            const cf = await getCloudflareContext();
            env = cf.env as unknown as Record<string, any>;
        } catch (e) {
            console.warn("[Webhook] Failed to get Cloudflare context, falling back to process.env");
        }

        const secret = env.MODAL_CALLBACK_SECRET;
        if (!secret) {
            console.error("[Webhook] Configuration Error: MODAL_CALLBACK_SECRET missing");
            return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
        }

        // 1. Auth Check
        const authHeader = req.headers.get("Authorization");
        const expected = `Bearer ${secret}`;
        
        if (authHeader !== expected) {
             console.error(`[Webhook] Auth failed. Received: ${authHeader?.substring(0, 15)}...`);
             return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = (await req.json()) as ProtectionResult;
        console.log(`[Webhook] Body: ${JSON.stringify(body)}`);

        const { artwork_id, status, protected_image_url, file_metadata, error_message } = body;
        
        // Ensure artwork_id is a number
        const numericArtworkId = Number(artwork_id);
        if (isNaN(numericArtworkId)) {
             console.error(`[Webhook] Invalid artwork_id: ${artwork_id}`);
             return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        console.log(`[Webhook] Processing update for artwork ${numericArtworkId}: ${status}`);
        
        const db = await getDb();

        // 2. Cancellation / Existance Check
        const currentArtwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, numericArtworkId),
            columns: { protectionStatus: true }
        });

        if (!currentArtwork) {
             console.error(`[Webhook] Artwork ${numericArtworkId} not found in DB`);
             return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
        }

        if (currentArtwork.protectionStatus === ProtectionStatus.CANCELED) {
             console.log(`[Webhook] Ignoring result for canceled artwork ${numericArtworkId}`);
             return NextResponse.json({ success: true, ignored: true });
        }

        if (status === "completed") {
             // Extract R2 Key from URL
             let r2Key = null;
             if (protected_image_url) {
                 try {
                     const urlObj = new URL(protected_image_url);
                     // Remove leading slash
                     r2Key = urlObj.pathname.startsWith("/") ? urlObj.pathname.substring(1) : urlObj.pathname;
                 } catch (e) {
                     console.warn(`[Webhook] Could not parse R2 key from ${protected_image_url}`);
                     // Fallback: If it's a relative path or just the key
                     r2Key = protected_image_url;
                 }
             }

             console.log(`[Webhook] Updating ${numericArtworkId} as PROTECTED. Key: ${r2Key}`);
             
             await db
                .update(artworks)
                .set({
                    protectionStatus: ProtectionStatus.PROTECTED,
                    protectedUrl: protected_image_url,
                    protectedR2Key: r2Key,
                    metadata: file_metadata,
                    updatedAt: new Date().toISOString()
                })
                .where(eq(artworks.id, numericArtworkId));
        } else {
            console.log(`[Webhook] Updating ${numericArtworkId} as FAILED: ${error_message}`);
            await db
                .update(artworks)
                .set({
                    protectionStatus: ProtectionStatus.FAILED,
                    metadata: { error: error_message }, 
                    updatedAt: new Date().toISOString()
                })
                .where(eq(artworks.id, numericArtworkId));
        }

        console.log(`[Webhook] Success`);
        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("[Webhook] Error processing callback:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
