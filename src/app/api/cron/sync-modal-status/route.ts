import { type NextRequest, NextResponse } from "next/server";
import { PipelineService } from "@/modules/artworks/services/pipeline.service";

// export const runtime = "edge"; // Disabled for now as Drizzle D1 might need Node runtime or specific edge compat

export async function GET(req: NextRequest) {
    console.log("[Cron] Job Started");

    // 1. Verify Shared Secret
    const authHeader = req.headers.get("Authorization");
    const secret = authHeader?.split(" ")[1];

    if (
        secret !== process.env.CRON_SECRET &&
        req.headers.get("Cron-Secret") !== process.env.CRON_SECRET
    ) {
        console.error("[Cron] Unauthorized: Invalid Secret");
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        // Phase 1: Sync Status of running jobs from Modal
        const syncResult = await PipelineService.syncRunningJobs();
        console.log(`[Cron] Synced ${syncResult.synced} jobs.`);

        // Phase 2: Advance Pipelines (Dispatch next steps for completed jobs)
        const advanceResult = await PipelineService.advancePipelines();
        console.log(`[Cron] Advanced ${advanceResult.advancements} pipelines.`);

        return NextResponse.json({
            success: true,
            synced: syncResult.synced,
            advanced: advanceResult.advancements,
        });
    } catch (error) {
        console.error("[Cron] Critical Execution Error:", error);
        return NextResponse.json(
            { success: false, error: String(error) },
            { status: 500 },
        );
    }
}
