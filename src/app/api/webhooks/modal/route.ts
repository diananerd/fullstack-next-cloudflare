import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { eq } from "drizzle-orm";
import { ProtectionStatus } from "@/modules/artworks/models/artwork.enum";

// Shared type (should be in a shared package eventually)
interface ProtectionResult {
    artwork_id: number;
    status: "completed" | "failed";
    original_image_url: string;
    protected_image_url?: string;
    processing_time: number;
    error_message?: string;
    file_metadata?: any;
}

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        // 1. Auth Check
        const authHeader = req.headers.get("Authorization");
        if (authHeader !== `Bearer ${process.env.MODAL_CALLBACK_SECRET}`) {
             return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = (await req.json()) as ProtectionResult;
        const { artwork_id, status, protected_image_url, file_metadata, error_message } = body;

        console.log(`[Webhook] Received update for artwork ${artwork_id}: ${status}`);
        
        const db = await getDb();

        // 2. Cancellation Check
        const currentArtwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artwork_id),
            columns: { protectionStatus: true }
        });

        if (!currentArtwork) {
             return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
        }

        if (currentArtwork.protectionStatus === ProtectionStatus.CANCELED) {
             console.log(`[Webhook] Ignoring result for canceled artwork ${artwork_id}`);
             return NextResponse.json({ success: true, ignored: true });
        }

        if (status === "completed") {
             // Extract R2 Key from URL if possible, or just store URL
             // URL format: .../protected/user/id/hash.png
             // R2 Key: protected/user/id/hash.png
             let r2Key = null;
             if (protected_image_url) {
                 try {
                     const urlObj = new URL(protected_image_url);
                     // If paths match, great. Otherwise we might store just URL or try to parse
                     // Assuming simple path extraction for now
                     r2Key = urlObj.pathname.startsWith("/") ? urlObj.pathname.substring(1) : urlObj.pathname;
                 } catch (e) {
                     console.warn("Could not parse R2 key from URL", protected_image_url);
                 }
             }

             await db
                .update(artworks)
                .set({
                    protectionStatus: ProtectionStatus.PROTECTED,
                    protectedUrl: protected_image_url,
                    protectedR2Key: r2Key,
                    metadata: file_metadata,
                    updatedAt: new Date().toISOString()
                })
                .where(eq(artworks.id, artwork_id));
        } else {
            await db
                .update(artworks)
                .set({
                    protectionStatus: ProtectionStatus.FAILED,
                    updatedAt: new Date().toISOString()
                })
                .where(eq(artworks.id, artwork_id));
             console.error(`[Webhook] Job failed for ${artwork_id}: ${error_message}`);
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("[Webhook] Error processing callback:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
