
import { getDb } from "../src/db"; // Adjust path as needed
import { artworkJobs, JobStatus } from "../src/modules/artworks/schemas/artwork-job.schema";
import { inArray, eq } from "drizzle-orm";

async function main() {
    const db = await getDb();
    console.log("Checking active jobs...");

    const activeJobs = await db
        .select()
        .from(artworkJobs)
        .where(
            inArray(artworkJobs.status, [
                JobStatus.QUEUED,
                JobStatus.PROCESSING,
                "uploading" as any 
            ]),
        );

    console.log(`Found ${activeJobs.length} active jobs.`);
    
    const byMethod: Record<string, number> = {};
    for (const job of activeJobs) {
        byMethod[job.method] = (byMethod[job.method] || 0) + 1;
        console.log(`- Job ${job.id} [${job.status}] Method: ${job.method} (Updated: ${job.updatedAt})`);
    }

    console.log("Summary by Method:", byMethod);
    process.exit(0);
}

main().catch(console.error);
