
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { artworkJobs } from "@/modules/artworks/schemas/artwork-job.schema";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { eq, desc } from "drizzle-orm";
import { JobStatus } from "@/modules/artworks/schemas/artwork-job.schema";

export const runtime = "edge";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await props.params;

        // --- Authentication Check ---
        const authHeader = req.headers.get("Authorization");
        const token = authHeader?.replace("Bearer ", "");
        const apiKey = process.env.DRIMIT_API_KEY || "drimit-dev-key"; // Fallback for dev

        if (!token || token !== apiKey) {
             return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // "id" here can be Artwork ID or Job ID.
        // The API upload returns "job_id = artwork_id".
        // So we query Artwork Jobs by Artwork ID, and take the latest.
        // OR we query by Job ID directly if it was a real Job ID.
        // Since my previous route returned artwork.id as job_id, I should treat it as Artwork ID basically.
        // Let's support both if possible? Or strictly Artwork ID for now as implementation detail.
        
        const artworkId = parseInt(id);
        if (isNaN(artworkId)) {
             return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
        }

        const db = await getDb();
        
        // Fetch latest job for this artwork
        const jobs = await db.select()
            .from(artworkJobs)
            .where(eq(artworkJobs.artworkId, artworkId))
            .orderBy(desc(artworkJobs.createdAt))
            .limit(1);

        const job = jobs[0];

        if (!job) {
             // Maybe it's just uploaded but not started?
             const artwork = await db.query.artworks.findFirst({
                 where: eq(artworks.id, artworkId)
             });
             if (artwork) {
                 return NextResponse.json({
                     id: String(artwork.id),
                     status: artwork.protectionStatus.toUpperCase(),
                     progress: 0,
                     logs: [],
                     result: {} 
                 });
             }
             return NextResponse.json({ error: "Job/Artwork not found" }, { status: 404 });
        }

        // Map Status
        let status = job.status.toUpperCase();
        if (status === "PROCESSING") status = "RUNNING"; // Align with docs examples if possible, or stick to PROCESSING

        // Calculate Progress
        let progress = 0;
        const result = job.result as any[] || [];
        const logs = result.map(s => `[${s.step_name}] ${s.status}`);

        if (status === "COMPLETED" || status === "DONE") {
            progress = 100;
        } else if (status === "RUNNING" || status === "PROCESSING") {
            // Rough estimate:
            // 4 main steps: Identity, Mimicry, Editing, Watermark
            // progress = (completed_steps / 4) * 100
            const completed = result.filter(s => s.status === "PASS" || s.status === "COMPLETED").length;
            progress = Math.min(99, Math.max(10, completed * 25));
        }

        return NextResponse.json({
            id: String(job.artworkId), // Identifying as Artwork ID
            job_db_id: String(job.id),
            status: status,
            progress: progress,
            logs: logs,
            result: {
                protected_url: job.outputUrl,
                steps_detail: result
            }
        });

    } catch (e) {
        console.error("[API Job Status]", e);
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
