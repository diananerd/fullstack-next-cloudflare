import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { PipelineService } from "@/modules/artworks/services/pipeline.service";

// export const runtime = "edge"; // Removed to fix import issues

export async function GET(
    _req: NextRequest,
    props: { params: Promise<{ id: string }> },
) {
    try {
        const params = await props.params;
        const { id } = params;

        // console.log(`[StatusAPI] Request for ${id}`);
        const artworkId = parseInt(id, 10);

        if (Number.isNaN(artworkId)) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        // --- NEW: Trigger explicit sync for this artwork ---
        // This ensures that when the UI checks status, we actually go verify it 
        // with the provider (Modal) instead of waiting for a cron job.
        // We use catch to prevent sync errors from blocking the status read.
        try {
            await PipelineService.syncRunningJobs(artworkId);
        } catch (syncError) {
            console.error("[StatusAPI] Sync failed:", syncError);
        }
        // ---------------------------------------------------

        const db = await getDb();

        // 1. Get Artwork
        const artwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
        });

        if (!artwork) {
            // console.log(`[StatusAPI] Artwork ${id} not found`);
            return NextResponse.json(
                { error: "Artwork not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({
            status: artwork.protectionStatus,
        });
    } catch (error) {
        console.error("[StatusAPI] Critical Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
