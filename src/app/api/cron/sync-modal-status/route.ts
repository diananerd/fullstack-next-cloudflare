import { and, eq, inArray, lt, or, like } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { MAX_POLLING_TIME_MS } from "@/constants/job.constant";
import { getDb } from "@/db";
import { ProtectionStatus } from "@/modules/artworks/models/artwork.enum";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";

// export const runtime = "edge"; // Removed to fix import issues

export async function GET(req: NextRequest) {
    console.log("[Cron] Job Started");

    // 1. Verify Shared Secret
    const authHeader = req.headers.get("Authorization");
    const secret = authHeader?.split(" ")[1];

    // Debug Log (Masked)
    // console.log(`[Cron] Secret received: ${secret ? '***' : 'null'}, Expected: ${process.env.CRON_SECRET ? '***' : 'null'}`);

    if (
        secret !== process.env.CRON_SECRET &&
        req.headers.get("Cron-Secret") !== process.env.CRON_SECRET
    ) {
        console.error("[Cron] Unauthorized: Invalid Secret");
        return new NextResponse("Unauthorized", { status: 401 });
    }

    // 2. Setup Modal URL
    const modalUrlStr = process.env.MODAL_STATUS_URL;
    console.log(`[Cron] Using Modal URL: ${modalUrlStr || "MISSING"}`);

    if (!modalUrlStr) {
        console.error("[Cron] Error: MODAL_STATUS_URL is undefined.");
        return NextResponse.json(
            { message: "MODAL_STATUS_URL not configured" },
            { status: 500 },
        );
    }

    const db = await getDb();

    // Calculate timeout threshold
    const now = Date.now();
    const timeoutThreshold = new Date(now - MAX_POLLING_TIME_MS).toISOString();

    // 3. Mark stale jobs as FAILED (Timeout)
    // DISABLED logic for now to prevent false failures while debugging.
    // We will rely on Modal returning "failed" status directly or manual cleanup.
    /*
  try {
      const result = await db.update(artworks)
        .set({
            protectionStatus: ProtectionStatus.FAILED,
            metadata: { error: "Job timeout (System Polling)" },
            updatedAt: new Date().toISOString()
        })
        .where(
            and(
                inArray(artworks.protectionStatus, [ProtectionStatus.QUEUED, ProtectionStatus.PROCESSING, ProtectionStatus.RUNNING]),
                lt(artworks.createdAt, timeoutThreshold)
            )
        );
      // D1 result usually has meta.changes
      console.log(`[Cron] Stale check complete.`); 
  } catch (timeoutErr) {
      console.error("[Cron] Error marking stale jobs:", timeoutErr);
  }
  */

    // 4. Select ACTIVE processing/queued artworks OR Broken Protected URLs
    // We include PROTECTED items that have a public R2 URL (r2.dev) to self-repair them.
    const jobs = await db
        .select()
        .from(artworks)
        .where(
            or(
                inArray(artworks.protectionStatus, [
                    ProtectionStatus.QUEUED,
                    ProtectionStatus.PROCESSING,
                    ProtectionStatus.RUNNING,
                ]),
                // Self-repair condition: Protected but with public URL
                and(
                    eq(artworks.protectionStatus, ProtectionStatus.PROTECTED),
                    like(artworks.protectedUrl, "%r2.dev%"),
                ),
            ),
        );

    const updates: { id: number; status: string }[] = [];
    const errors: { id: number; error: string }[] = [];
    const finishedIds: string[] = []; // IDs to ACK (clean up from Modal)

    console.log(`[Cron] Found ${jobs.length} pending jobs to check.`);

    // Rule 1: Only request if pending jobs exist
    if (jobs.length === 0) {
        console.log("[Cron] No pending jobs. Exiting.");
        return NextResponse.json({ message: "No pending jobs" });
    }

    try {
        // Prepare Bulk Request
        const jobMap = new Map<string, (typeof jobs)[0]>();
        jobs.forEach((j) => jobMap.set(String(j.id), j));

        const payload = {
            artwork_ids: Array.from(jobMap.keys()),
            // We don't send ack_ids here yet; we do it in a second pass or next run
            // Actually, we can't ACK untill we *know* we saved the result.
            // So the flow is: Check -> Save -> (Next Run) -> Check -> (Wait, if we saved it as protected, we won't check it again!)
            // WE NEED A QUEUE OF "TO_ACK" in the DB? Or just execute a second HTTP call right now.
            // Let's do a second HTTP call at the end of this function.
        };

        console.log(
            `[Cron] Sending bulk status check for ${payload.artwork_ids.length} jobs to Modal...`,
        );

        const response = await fetch(modalUrlStr, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Bulk API Failed (${response.status}): ${text}`);
        }

        const results = (await response.json()) as Record<string, any>; // Dict[artwork_id, state]

        // Process Results
        for (const [idStr, state] of Object.entries(results)) {
            const job = jobMap.get(idStr);
            if (!job) continue;

            // console.log(`[Cron] Job ${job.id} status: ${state.status}`);

            if (state.status === "completed" && state.result) {
                // Determine the correct URL for the protected image
                // Prefer the local asset proxy via key if available, otherwise fallback to the public URL.
                const appUrl =
                    process.env.NEXT_PUBLIC_APP_URL ||
                    "https://shield.drimit.io";

                let r2Key = state.result.protected_image_key;

                // Fallback: Extract key from URL if missing (handles old jobs or missing keys)
                if (!r2Key && state.result.protected_image_url) {
                    const urlStr = state.result.protected_image_url;
                    if (urlStr.includes("/protected/")) {
                        r2Key = `protected/${urlStr.split("/protected/")[1]}`;
                    } else {
                        const parts = urlStr.split("/");
                        r2Key = `protected/${parts[parts.length - 1]}`;
                    }
                }

                const finalUrl = r2Key
                    ? `${appUrl}/api/assets/${r2Key}`
                    : state.result.protected_image_url;

                await db
                    .update(artworks)
                    .set({
                        protectionStatus: ProtectionStatus.PROTECTED,
                        protectedUrl: finalUrl,
                        protectedR2Key: r2Key,
                        metadata: {
                            ...(job.metadata || {}),
                            ...state.result.file_metadata,
                            processingTime: state.result.processing_time,
                            syncedAt: new Date().toISOString(),
                        },
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(artworks.id, job.id));

                updates.push({ id: job.id, status: "protected" });
                finishedIds.push(idStr);
            } else if (state.status === "failed") {
                await db
                    .update(artworks)
                    .set({
                        protectionStatus: ProtectionStatus.FAILED,
                        metadata: {
                            ...(job.metadata || {}),
                            error: state.error || state.error_message,
                        },
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(artworks.id, job.id));

                console.error(
                    `[Cron] Job ${job.id} FAILED: ${state.error || state.error_message}`,
                ); // LOG ERROR
                updates.push({ id: job.id, status: "failed" });
                finishedIds.push(idStr);
            } else if (
                state.status === "processing" &&
                job.protectionStatus !== ProtectionStatus.PROCESSING
            ) {
                // Consistency Sync: If Modal is processing but DB turned stale/queued, update it.
                await db
                    .update(artworks)
                    .set({
                        protectionStatus: ProtectionStatus.PROCESSING,
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(artworks.id, job.id));

                console.log(`[Cron] Job ${job.id} Sync -> PROCESSING`);
                updates.push({ id: job.id, status: "processing" });
            }
        }

        // --- ACK / CLEANUP ---
        if (finishedIds.length > 0) {
            console.log(
                `[Cron] cleaning up ${finishedIds.length} finished jobs from Modal...`,
            );
            // We fire-and-forget this call, or wait? Better wait to ensure consistency.
            await fetch(modalUrlStr, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    artwork_ids: [],
                    ack_ids: finishedIds,
                }),
            });
        }
    } catch (err) {
        console.error(`[Cron] Critical Bulk Error:`, err);
        return NextResponse.json(
            { message: "Bulk Check Failed", error: String(err) },
            { status: 500 },
        );
    }

    console.log(
        `[Cron] Finished. Updates: ${updates.length}, Errors: ${errors.length}`,
    );

    return NextResponse.json({
        message: "Sync complete",
        updates,
        errors,
    });
}
