import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { entities } from "@/modules/artworks/schemas/entity.schema";
import { workspaceItems as artworkData } from "@/modules/artworks/schemas/workspace-item.schema";
import { artworkJobs } from "@/modules/artworks/schemas/artwork-job.schema";
import { PipelineService } from "@/modules/artworks/services/pipeline.service";

export async function GET(
    _req: NextRequest,
    props: { params: Promise<{ id: string }> },
) {
    try {
        const params = await props.params;
        const artworkId = params.id;

        if (!artworkId) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        const db = await getDb();

        // 1. Get Artwork
        const [artwork] = await db
            .select({
                ...getTableColumns(entities),
                ...getTableColumns(artworkData),
            })
            .from(entities)
            .innerJoin(artworkData, eq(artworkData.id, entities.id))
            .where(
                and(eq(entities.id, artworkId), eq(entities.type, "artwork")),
            )
            .limit(1);

        // Sync with Modal only if the artwork is actively processing.
        const activeStatuses = ["queued", "processing", "uploading"];
        if (
            artwork &&
            activeStatuses.includes(artwork.protectionStatus ?? "")
        ) {
            try {
                await PipelineService.syncRunningJobs(artworkId);
                const [refreshed] = await db
                    .select({
                        ...getTableColumns(entities),
                        ...getTableColumns(artworkData),
                    })
                    .from(entities)
                    .innerJoin(artworkData, eq(artworkData.id, entities.id))
                    .where(eq(entities.id, artworkId))
                    .limit(1);
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

        // 2. Get Latest Job for Granular Progress
        const [latestJob] = await db
            .select()
            .from(artworkJobs)
            .where(eq(artworkJobs.artworkId, artworkId))
            .orderBy(desc(artworkJobs.createdAt))
            .limit(1);

        let progress = null;
        if (latestJob) {
            const result = (latestJob.result as any) || {};
            progress = {
                status: latestJob.status,
                currentStep: latestJob.currentStep,
                steps: result.steps || [],
                shieldScore: result.shieldScore,
                total_duration_ms: result.total_duration_ms,
                error: latestJob.errorMessage,
            };
        }

        return NextResponse.json({
            status: artwork.protectionStatus,
            progress: progress || null,
        });
    } catch (error) {
        console.error("[StatusAPI] Critical Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
