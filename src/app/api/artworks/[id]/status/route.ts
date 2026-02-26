import { eq, desc } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { artworkJobs } from "@/modules/artworks/schemas/artwork-job.schema";
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

        const db = await getDb();

        // 1. Get Artwork
        const artwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
        });

        // Sync with Modal only if the artwork is actively processing.
        // Final states (done/failed/canceled) never need a Modal round-trip.
        const activeStatuses = ["queued", "processing", "uploading"];
        if (artwork && activeStatuses.includes(artwork.protectionStatus)) {
            try {
                await PipelineService.syncRunningJobs(artworkId);
                // Re-fetch after sync so the response reflects the latest state
                const refreshed = await db.query.artworks.findFirst({
                    where: eq(artworks.id, artworkId),
                });
                if (refreshed) Object.assign(artwork, refreshed);
            } catch (syncError) {
                console.error("[StatusAPI] Sync failed:", syncError);
            }
        }

        if (!artwork) {
            return NextResponse.json(
                { error: "Artwork not found" },
                { status: 404 },
            );
        }
        
        // 2. Get Active/Latest Job for Granular Progress
        const latestJob = await db.query.artworkJobs.findFirst({
            where: eq(artworkJobs.artworkId, artworkId),
            orderBy: [desc(artworkJobs.createdAt)],
        });

        // Parse V2 Result if available
        let progress = null;
        if (latestJob) {
             const result = (latestJob.result as any) || {};
             progress = {
                 status: latestJob.status,
                 currentStep: latestJob.currentStep,
                 steps: result.steps || [], 
                 shieldScore: result.shieldScore, // Pass score to frontend
                 total_duration_ms: result.total_duration_ms,
                 error: latestJob.errorMessage
             };
        }

        return NextResponse.json({
            status: artwork.protectionStatus,
            progress: progress || null
        });
    } catch (error) {
        console.error("[StatusAPI] Critical Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
