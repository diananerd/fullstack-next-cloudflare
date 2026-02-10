import { eq, inArray, and, asc, desc, count, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { artworks } from "../schemas/artwork.schema";
import {
    artworkJobs,
    JobStatus,
    type JobStatusType,
} from "../schemas/artwork-job.schema";
import {
    MAX_CONCURRENT_JOBS,
    JOB_TIMEOUT_MINUTES,
} from "@/constants/job.constant";
import {
    ProtectionStatus,
    type ProtectionMethodType,
} from "../models/artwork.enum";
import { dispatchProtectionJob } from "../utils/dispatch-job";
import { getProtectionConfig } from "@/lib/protection-config";
import { deleteFromR2 } from "@/lib/r2";
import { CreditService } from "@/modules/credits/services/credit.service";

// Temporary constant, should share with action
const PROCESS_COST = 1.0;

export class PipelineService {
    /**
     * Initializes a new protection pipeline for an artwork.
     * Creates the first job but does not necessarily dispatch it immediately (optional).
     */
    static async startPipeline(
        artworkId: number,
        userId: string,
        pipeline: { method: ProtectionMethodType; config?: any }[],
    ) {
        const db = await getDb();

        // 1. Validate Artwork State
        const artwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
        });

        if (!artwork) throw new Error("Artwork not found");

        // 1. Hard Reset / Cleanup Logic
        // We force a clean slate for the NEW pipeline request.
        // We must fetch ALL previous jobs, delete their artifacts from R2 (to avoid stale content),
        // and mark them as superseded.
        const allPreviousJobs = await db
            .select()
            .from(artworkJobs)
            .where(eq(artworkJobs.artworkId, artworkId));

        if (allPreviousJobs.length > 0) {
            console.log(
                `[Pipeline] Hard Reset: Cleaning up ${allPreviousJobs.length} previous jobs for artwork ${artworkId}.`,
            );

            // A. Delete R2 Artifacts (Sequential to ensure simple error handling, or parallel if many)
            const keysToDelete = allPreviousJobs
                .map((j) => j.outputKey)
                .filter((k): k is string => !!k);

            if (keysToDelete.length > 0) {
                // We don't await strictly for all deletes to finish to avoid blocking UI too long,
                // but for a "Hard Reset" it is safer to ensure they are gone.
                // Let's use Promise.allsettled to not throw on single fail
                await Promise.allSettled(
                    keysToDelete.map((key) =>
                        deleteFromR2(key).catch((e) =>
                            console.error(`Failed to delete ${key}`, e),
                        ),
                    ),
                );
            }

            // B. Invalidate DB Rows
            await db
                .update(artworkJobs)
                .set({
                    status: JobStatus.FAILED,
                    errorMessage:
                        "Hard Reset: Superseded by new protection request.",
                    updatedAt: new Date().toISOString(),
                })
                .where(
                    inArray(
                        artworkJobs.id,
                        allPreviousJobs.map((j) => j.id),
                    ),
                );
        }

        console.log(
            `[Pipeline] Starting pipeline for Artwork ${artworkId}. Steps: ${pipeline.length}`,
        );

        // 2. Prepare Metadata
        const metadata = {
            ...(artwork.metadata || {}),
            pipeline: {
                steps: pipeline,
                currentStep: 0,
                pending: true,
            },
        };

        // 3. Create First Job Record (Step 0)
        const firstStep = pipeline[0];
        const now = new Date().toISOString();

        // Used for rollback if dispatch fails
        let jobId: number | undefined;

        try {
            const [insertedJob] = await db
                .insert(artworkJobs)
                .values({
                    artworkId: artworkId,
                    method: firstStep.method,
                    config: firstStep.config || {},
                    stepOrder: 0,
                    inputUrl: artwork.url, // Initial input is the original image
                    status: JobStatus.PENDING,
                    createdAt: now,
                    updatedAt: now,
                })
                .returning();

            jobId = insertedJob.id;

            // 4. Update Artwork Status
            await db
                .update(artworks)
                .set({
                    protectionStatus: ProtectionStatus.QUEUED,
                    metadata: metadata,
                    updatedAt: now,
                })
                .where(eq(artworks.id, artworkId));

            // 5. Queue Job (No immediate dispatch)
            // We rely on the unified Queue System (processQueue) to pick this up
            // respecting concurrency limits.
            console.log(
                `[Pipeline] Job ${insertedJob.id} queued (pending dispatch).`,
            );

            // await this.dispatchJob(insertedJob.id, userId);
        } catch (error) {
            console.error("[Pipeline] Start failed:", error);
            // If job was created but dispatch failed, mark as failed
            if (jobId) {
                await db
                    .update(artworkJobs)
                    .set({
                        status: JobStatus.FAILED,
                        errorMessage: String(error),
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(artworkJobs.id, jobId));
            }
            // Mark artwork as failed
            await db
                .update(artworks)
                .set({
                    protectionStatus: ProtectionStatus.FAILED,
                    metadata: { ...metadata, error: String(error) },
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(artworks.id, artworkId));

            throw error;
        }
    }

    /**
     * Resumes or Restarts a pipeline for a given artwork.
     * Useful for retrying failed jobs or ensuring consistency.
     */
    static async resumePipeline(
        artworkId: number,
        userId: string,
    ): Promise<void> {
        const db = await getDb();

        const artwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
        });

        if (!artwork) throw new Error("Artwork not found");

        // 1. Check existing state
        const jobs = await db
            .select()
            .from(artworkJobs)
            .where(eq(artworkJobs.artworkId, artworkId))
            .orderBy(desc(artworkJobs.stepOrder)); // Latest first

        const metadata = artwork.metadata as any;
        const pipeline = metadata?.pipeline;

        if (!pipeline || !pipeline.steps || pipeline.steps.length === 0) {
            // Legacy Fallback: Create a single-step pipeline based on the main 'method' field
            console.warn(
                `[Pipeline] Converting legacy/simple artwork ${artworkId} to pipeline.`,
            );
            const method = artwork.method || "mist";
            const newPipeline = [
                { method: method as ProtectionMethodType, config: {} },
            ];

            // Clean slate
            await this.startPipeline(artworkId, userId, newPipeline);
            return;
        }

        // 2. Identify fail point
        const totalSteps = pipeline.steps.length;
        let jobToRestart = jobs.find(
            (j) =>
                j.status === JobStatus.FAILED || j.status === JobStatus.PENDING,
        );

        if (!jobToRestart) {
            // No obvious failed job. Maybe stuck in PROCESSING?
            // Or maybe currentStep in metadata is desynced?
            const currentStepIdx = pipeline.currentStep || 0;
            console.log(
                `[Pipeline] Resume: Checking state for Step ${currentStepIdx}/${totalSteps}`,
            );

            const existingJobAtStep = jobs.find(
                (j) => j.stepOrder === currentStepIdx,
            );

            if (
                existingJobAtStep &&
                existingJobAtStep.status !== JobStatus.COMPLETED
            ) {
                console.log(
                    `[Pipeline] Resume: Found stuck job at step ${currentStepIdx} (Status: ${existingJobAtStep.status})`,
                );
                jobToRestart = existingJobAtStep;
            } else if (!existingJobAtStep && currentStepIdx < totalSteps) {
                console.log(
                    `[Pipeline] Resume: Job for step ${currentStepIdx} missing. Attempting advancement.`,
                );
                // Next step hasn't been created yet. We can start it.
                // We let advancePipelines handle creation, IF the previous one is completed.
                // But if we are here manually, maybe we force creation.
                // For simplicity, if everything looks OK, advance.
                const advanceRes = await this.advancePipelines();
                if (advanceRes.advancements > 0) return;

                // If advance didn't work, maybe we need to create the step.
                // But advance only works if prev is COMPLETED.
                if (currentStepIdx > 0) {
                    const prevJob = jobs.find(
                        (j) => j.stepOrder === currentStepIdx - 1,
                    );
                    if (prevJob?.status === JobStatus.COMPLETED) {
                        // We can retry creating next step by 'waking up' the artwork logic
                        // Actually advancePipelines should have caught it.
                        console.warn(
                            "[Pipeline] Resume: advancePipelines failed despite previous job completion.",
                        );
                    }
                }
            }
        }

        // 3. Restart the specific job
        if (jobToRestart) {
            console.log(
                `[Pipeline] Retrying Job ${jobToRestart.id} (Step ${jobToRestart.stepOrder})`,
            );

            // Generate new ID if needed? No, we update the existing row to PENDING usually,
            // or create a NEW row for history.
            // Better to update to keep history clean for now, or use a new row.
            // Let's reset the status of existing job to PENDING so it gets picked up.

            await db
                .update(artworkJobs)
                .set({
                    status: JobStatus.PENDING,
                    externalId: null, // Reset external tracking
                    errorMessage: null,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(artworkJobs.id, jobToRestart.id));

            // Update Artwork status
            await db
                .update(artworks)
                .set({
                    protectionStatus: ProtectionStatus.QUEUED,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(artworks.id, artworkId));

            // Queue for dispatch
            console.log(
                `[Pipeline] Job ${jobToRestart.id} marked as PENDING (Queued for dispatch).`,
            );
            // await this.dispatchJob(jobToRestart.id, userId);
        } else {
            // Fallback: If no jobs exist but pipeline does, start from scratch?
            if (jobs.length === 0) {
                await this.startPipeline(artworkId, userId, pipeline.steps);
            } else {
                console.log(
                    "[Pipeline] Nothing to resume. Artwork might be done or inconsistent.",
                );
                // If DONE, ensure status is DONE
                await db
                    .update(artworks)
                    .set({
                        protectionStatus: ProtectionStatus.DONE,
                    })
                    .where(eq(artworks.id, artworkId));
            }
        }
    }

    /**
     * Dispatches a specific Job to the external provider (Modal).
     */
    static async dispatchJob(jobId: number, userId: string) {
        const db = await getDb();
        const job = await db.query.artworkJobs.findFirst({
            where: eq(artworkJobs.id, jobId),
        });

        if (!job) throw new Error(`Job ${jobId} not found`);
        if (job.status !== JobStatus.PENDING) {
            console.warn(
                `[Pipeline] Job ${jobId} is not PENDING (is ${job.status}). Skipping dispatch.`,
            );
            return;
        }

        console.log(`[Pipeline] Dispatching Job ${jobId} (${job.method})`);

        try {
            const externalId = await dispatchProtectionJob({
                artworkId: job.artworkId, // Keep for logging/compatibility
                userId: userId,
                imageUrl: job.inputUrl,
                method: job.method,
                config: job.config,
                // We could pass job.id to Modal if it supported a generic correlation ID
            });

            await db
                .update(artworkJobs)
                .set({
                    status: JobStatus.QUEUED,
                    externalId: externalId,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(artworkJobs.id, jobId));

            // Update Artwork processing status
            await db
                .update(artworks)
                .set({
                    protectionStatus: ProtectionStatus.PROCESSING,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(artworks.id, job.artworkId));
        } catch (error) {
            console.error(`[Pipeline] Dispatch Error Job ${jobId}:`, error);
            await db
                .update(artworkJobs)
                .set({
                    status: JobStatus.FAILED,
                    errorMessage: String(error),
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(artworkJobs.id, jobId));
            throw error;
        }
    }

    /**
     * Main Orchestration Loop part 1: Sync Statuses
     * Queries external providers for status of running jobs.
     */
    static async syncRunningJobs() {
        const db = await getDb();

        // Find jobs that are QUEUED or PROCESSING
        const activeJobs = await db
            .select()
            .from(artworkJobs)
            .where(
                inArray(artworkJobs.status, [
                    JobStatus.QUEUED,
                    JobStatus.PROCESSING,
                ]),
            )
            .limit(100); // Batching: Only process 100 jobs per cycle to prevent OOM

        if (activeJobs.length === 0) return { synced: 0 };

        console.log(`[Pipeline] Syncing ${activeJobs.length} active jobs`);

        const jobsByMethod: Record<string, typeof activeJobs> = {};
        for (const j of activeJobs) {
            // ZOMBIE CHECK:
            // 1. PROCESSING Timeout: If processing for > 30 mins, it's likely dead (Modal timeout is 10m).
            // 2. QUEUED Timeout: If queued for > 6 hours, it's a system failure or extreme backlog.
            const lastUpdate = new Date(j.updatedAt).getTime();
            const now = Date.now();
            const elapsedHours = (now - lastUpdate) / (1000 * 60 * 60);
            const elapsedMinutes = (now - lastUpdate) / (1000 * 60);

            let isZombie = false;
            let zombieReason = "";

            if (
                j.status === JobStatus.PROCESSING &&
                elapsedMinutes > JOB_TIMEOUT_MINUTES
            ) {
                isZombie = true;
                zombieReason = `Processing Timeout: Exceeded ${JOB_TIMEOUT_MINUTES}m limit.`;
            } else if (j.status === JobStatus.QUEUED && elapsedHours > 6) {
                isZombie = true;
                zombieReason = "Queue Timeout: Stuck in queue for > 6h";
            }

            if (isZombie) {
                console.warn(
                    `[Pipeline] Job ${j.id} timed out (${zombieReason}). Marking as failed.`,
                );
                await db
                    .update(artworkJobs)
                    .set({
                        status: JobStatus.FAILED,
                        errorMessage: zombieReason,
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(artworkJobs.id, j.id));
                continue; // Skip sync for this job
            }

            if (!jobsByMethod[j.method]) jobsByMethod[j.method] = [];
            jobsByMethod[j.method].push(j);
        }

        const updates = [];
        const pendingAcks: Record<string, string[]> = {};

        for (const [method, jobs] of Object.entries(jobsByMethod)) {
            try {
                const config = getProtectionConfig(
                    method as ProtectionMethodType,
                );
                if (!config.statusUrl) continue;

                // Map by External ID (Modal Job ID) because that's what we have
                // Note: The previous implementation mapped by Artwork ID.
                // We need to check carefully about what Modal expects.
                // Assuming we use Artwork ID for bulk query? No, usually Job ID is better.
                // However, based on reading `cron/sync-modal-status/route.ts`, it was sending `artwork_ids`.
                // In this new schema, we should check if we can switch to `job_ids` or check mapping.
                // Let's assume for now we must use `artwork_ids` to support existing Modal code
                // OR we refactor the python side later.
                // CRITICAL: We pass `artworkId` to dispatch, so Modal knows Artwork ID.
                // But one Artwork might have multiple jobs? Not concurrently for SAME method usually?
                // Actually they definitely could in a retrying scenario.
                // Ideally, we should query by Job ID.
                // But to be safe with existing backend, let's use Artwork ID.

                const jobMap = new Map<string, (typeof activeJobs)[0]>();
                jobs.forEach((j) => jobMap.set(String(j.artworkId), j));

                const artworkIds = Array.from(jobMap.keys());

                const response = await fetch(config.statusUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ artwork_ids: artworkIds }),
                });

                if (!response.ok) {
                    console.error(
                        `[Pipeline] Status check failed for ${method}: ${response.status}`,
                    );
                    continue;
                }

                const results = (await response.json()) as Record<string, any>;
                const finishedIds: string[] = [];

                for (const [artId, state] of Object.entries(results)) {
                    const job = jobMap.get(artId);
                    if (!job) continue;

                    if (state.status === "completed" && state.result) {
                        console.log(
                            `[Pipeline] Job ${job.id} COMPLETED. Output: ${state.result.protected_image_key}`,
                        );
                        updates.push(
                            db
                                .update(artworkJobs)
                                .set({
                                    status: JobStatus.COMPLETED,
                                    outputUrl: state.result.protected_image_url,
                                    outputKey:
                                        state.result.protected_image_key ||
                                        state.result.file_key,
                                    meta: state.result.file_metadata,
                                    updatedAt: new Date().toISOString(),
                                })
                                .where(eq(artworkJobs.id, job.id)),
                        );
                        finishedIds.push(artId);
                    } else if (state.status === "failed") {
                        console.warn(
                            `[Pipeline] Job ${job.id} FAILED (External). Reason: ${state.error}`,
                        );
                        updates.push(
                            db
                                .update(artworkJobs)
                                .set({
                                    status: JobStatus.FAILED,
                                    errorMessage:
                                        state.error || "Unknown external error",
                                    updatedAt: new Date().toISOString(),
                                })
                                .where(eq(artworkJobs.id, job.id)),
                        );
                        finishedIds.push(artId);
                    } else if (
                        state.status === "running" ||
                        state.status === "processing"
                    ) {
                        // Heartbeat / Status Promotion
                        // If job moves from QUEUED -> PROCESSING
                        if (job.status !== JobStatus.PROCESSING) {
                            console.log(
                                `[Pipeline] Job ${job.id} promoted QUEUED -> PROCESSING`,
                            );
                            updates.push(
                                db
                                    .update(artworkJobs)
                                    .set({
                                        status: JobStatus.PROCESSING,
                                        updatedAt: new Date().toISOString(),
                                    })
                                    .where(eq(artworkJobs.id, job.id)),
                            );
                        }
                    }
                }

                if (finishedIds.length > 0) {
                    pendingAcks[method] = finishedIds;
                }
            } catch (err) {
                console.error(
                    `[Pipeline] Error syncing method ${method}:`,
                    err,
                );
            }
        }

        await Promise.all(updates);

        // Process ACKs only after successful DB updates
        for (const [method, ids] of Object.entries(pendingAcks)) {
            try {
                console.log(
                    `[Pipeline] Sending ACK to ${method} for ${ids.length} jobs`,
                );

                const config = getProtectionConfig(
                    method as ProtectionMethodType,
                );
                if (config.statusUrl) {
                    await fetch(config.statusUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ artwork_ids: [], ack_ids: ids }),
                    });
                }
            } catch (err) {
                console.warn(
                    `[Pipeline] Failed to ACK jobs for ${method}:`,
                    err,
                );
            }
        }

        return { synced: updates.length };
    }

    /**
     * Main Orchestration Loop part 2: Advance Pipelines
     * Checks for completed jobs and queues the next step.
     * Uses optimized batching to avoid N+1 queries.
     */
    static async advancePipelines() {
        const db = await getDb();

        // 1. Fetch Artworks that need advancing (Processing/Queued)
        // Optimized: Fetch recent jobs for these artworks in parallel or via smarter query?
        // Drizzle doesn't support easy "Last Job per Group" in one obscure line without raw SQL.
        // But we can optimize by fetching ALL relevant jobs for these artworks in one go if the set is smallish (batch size).

        // A. Get Candidates (Batch Limit 50)
        const activeArtworks = await db.query.artworks.findMany({
            where: inArray(artworks.protectionStatus, [
                ProtectionStatus.PROCESSING,
                ProtectionStatus.QUEUED,
            ]),
            limit: 50, // Batch size for advancing
            with: {
                // Efficiently fetch only the latest job?
                // Drizzle `with` doesn't support limit/orderBy on relations easily in SQLite driver sometimes.
                // Fallback: Fetch IDs, then fetch jobs.
            },
        });

        if (activeArtworks.length === 0) return { advancements: 0 };

        const artworkIds = activeArtworks.map((a) => a.id);

        // B. Fetch Latest Jobs for these IDs using Window Function equivalent or just raw list and filtering in memory (for 50 items it's fast)
        // We fetch ALL jobs for these 50 artworks. It's safe because usually < 5 jobs per artwork.
        const allJobs = await db
            .select()
            .from(artworkJobs)
            .where(inArray(artworkJobs.artworkId, artworkIds))
            .orderBy(desc(artworkJobs.stepOrder), desc(artworkJobs.id));

        // Group in memory
        const jobsByArtwork = new Map<number, (typeof allJobs)[0]>();
        for (const job of allJobs) {
            if (!jobsByArtwork.has(job.artworkId)) {
                jobsByArtwork.set(job.artworkId, job); // First one is latest due to orderBy desc
            }
        }

        let advancements = 0;

        for (const artwork of activeArtworks) {
            try {
                const lastJob = jobsByArtwork.get(artwork.id);
                if (!lastJob) continue;

                // RECOVERY: handled by processQueue automatically.
                // if (lastJob.status === JobStatus.PENDING) ...

                // If last job is PENDING/QUEUED/PROCESSING/FAILED, we wait (or stop).
                if (lastJob.status !== JobStatus.COMPLETED) {
                    if (lastJob.status === JobStatus.FAILED) {
                        await db
                            .update(artworks)
                            .set({
                                protectionStatus: ProtectionStatus.FAILED,
                                metadata: {
                                    ...(artwork.metadata as any),
                                    error: `Job Failed: ${lastJob.errorMessage}`,
                                },
                            })
                            .where(eq(artworks.id, artwork.id));
                    }
                    continue;
                }

                // Job is COMPLETED. Check if there is next step.
                const metadata = artwork.metadata as any;
                const pipeline = metadata.pipeline;
                if (!pipeline) continue; // Should not happen

                const currentStepIdx = lastJob.stepOrder;
                const totalSteps = pipeline.steps.length;

                if (currentStepIdx >= totalSteps - 1) {
                    // Pipeline Finished
                    if (artwork.protectionStatus !== ProtectionStatus.DONE) {
                        console.log(
                            `[Pipeline] Artwork ${artwork.id} FINISHED.`,
                        );

                        // Charge Credits for successful processing
                        try {
                            await CreditService.chargeCredits(
                                artwork.userId,
                                PROCESS_COST,
                                "Image Protection Processing (Completed)",
                                `artwork_${artwork.id}`,
                                {
                                    artworkId: artwork.id,
                                    jobIds: allJobs
                                        .filter(
                                            (j) => j.artworkId === artwork.id,
                                        )
                                        .map((j) => j.id),
                                },
                            );
                            console.log(
                                `[Pipeline] Charged ${PROCESS_COST} credits to user ${artwork.userId}`,
                            );
                        } catch (error) {
                            console.error(
                                `[Pipeline] Failed to charge user ${artwork.userId} for artwork ${artwork.id}:`,
                                error,
                            );
                            // We do NOT stop the status update. The service was rendered.
                            // TODO: Add to debt ledger or retry queue
                        }

                        await db
                            .update(artworks)
                            .set({
                                protectionStatus: ProtectionStatus.DONE,
                                updatedAt: new Date().toISOString(),
                                metadata: {
                                    ...metadata,
                                    pipeline: {
                                        ...pipeline,
                                        pending: false,
                                        currentStep: currentStepIdx,
                                    },
                                },
                            })
                            .where(eq(artworks.id, artwork.id));
                    }
                } else {
                    // Trigger Next Step
                    const nextStepIdx = currentStepIdx + 1;

                    // Double check we haven't already created the next job (race condition check)
                    // We check if ANY job exists for this step, regardless of status
                    const existingNext = await db
                        .select()
                        .from(artworkJobs)
                        .where(
                            and(
                                eq(artworkJobs.artworkId, artwork.id),
                                eq(artworkJobs.stepOrder, nextStepIdx),
                            ),
                        )
                        .limit(1);

                    if (existingNext.length > 0) continue; // Already created

                    // Validate Input for Next Step
                    const inputUrl = lastJob.outputUrl;
                    if (!inputUrl) {
                        console.error(
                            `[Pipeline] Job ${lastJob.id} completed but has no outputURL. Cannot proceed.`,
                        );
                        // Mark as failed? Or just log?
                        // If we don't mark as failed, it will loop forever here.
                        await db
                            .update(artworkJobs)
                            .set({
                                status: JobStatus.FAILED,
                                errorMessage:
                                    "Output URL missing from previous step",
                                updatedAt: new Date().toISOString(),
                            })
                            .where(eq(artworkJobs.id, lastJob.id));
                        await db
                            .update(artworks)
                            .set({
                                protectionStatus: ProtectionStatus.FAILED,
                                metadata: {
                                    ...metadata,
                                    error: "Pipeline Error: Previous step produced no output.",
                                },
                            })
                            .where(eq(artworks.id, artwork.id));
                        continue;
                    }

                    console.log(
                        `[Pipeline] Advancing Artwork ${artwork.id} to step ${nextStepIdx}. Input: ${inputUrl}`,
                    );

                    const nextStepConfig = pipeline.steps[nextStepIdx];

                    // Create and Dispatch
                    const [newJob] = await db
                        .insert(artworkJobs)
                        .values({
                            artworkId: artwork.id,
                            method: nextStepConfig.method,
                            config: nextStepConfig.config || {},
                            stepOrder: nextStepIdx,
                            inputUrl: inputUrl,
                            status: JobStatus.PENDING,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        })
                        .returning();

                    // Dispatch (Queue)
                    try {
                        // We do NOT dispatch immediately. We let processQueue handle it.
                        // await this.dispatchJob(newJob.id, artwork.userId);
                        console.log(
                            `[Pipeline] Job ${newJob.id} (Step ${nextStepIdx}) created and queued.`,
                        );
                        advancements++;

                        // Update Metadata current step
                        await db
                            .update(artworks)
                            .set({
                                metadata: {
                                    ...metadata,
                                    pipeline: {
                                        ...pipeline,
                                        currentStep: nextStepIdx,
                                    },
                                },
                            })
                            .where(eq(artworks.id, artwork.id));
                    } catch (e) {
                        console.error(
                            `[Pipeline] Failed to dispatch next step for ${artwork.id}`,
                            e,
                        );
                        // Job marked as failed in dispatchJob
                    }
                }
            } catch (err) {
                console.error(
                    `[Pipeline] Error processing artwork ${artwork.id}`,
                    err,
                );
                // Continue to next artwork
            }
        }
        return { advancements };
    }

    /**
     * Main Orchestration Loop part 3: Queue Processor
     * Manages flow control and concurrency limits.
     */
    static async processQueue() {
        const db = await getDb();

        // 1. Check Capacity
        const activeJobsResult = await db
            .select({ count: count() })
            .from(artworkJobs)
            .where(
                inArray(artworkJobs.status, [
                    JobStatus.QUEUED,
                    JobStatus.PROCESSING,
                ]),
            );

        const activeCount = activeJobsResult[0]?.count || 0;
        const slotsAvailable = MAX_CONCURRENT_JOBS - activeCount;

        if (slotsAvailable <= 0) {
            console.log(
                `[Queue] Full capacity (${activeCount}/${MAX_CONCURRENT_JOBS}). Waiting.`,
            );
            return { dispatched: 0, active: activeCount };
        }

        console.log(
            `[Queue] Slots available: ${slotsAvailable} (Active: ${activeCount})`,
        );

        // 2. Fetch High Priority (Continuing Pipelines)
        const highPriorityJobs = await db
            .select()
            .from(artworkJobs)
            .where(
                and(
                    eq(artworkJobs.status, JobStatus.PENDING),
                    sql`${artworkJobs.stepOrder} > 0`,
                ),
            )
            .orderBy(asc(artworkJobs.createdAt))
            .limit(slotsAvailable);

        let jobsToDispatch = [...highPriorityJobs];

        // 3. Fetch Normal Priority (New Pipelines)
        if (jobsToDispatch.length < slotsAvailable) {
            const remaining = slotsAvailable - jobsToDispatch.length;
            const normalPriorityJobs = await db
                .select()
                .from(artworkJobs)
                .where(
                    and(
                        eq(artworkJobs.status, JobStatus.PENDING),
                        eq(artworkJobs.stepOrder, 0),
                    ),
                )
                .orderBy(asc(artworkJobs.createdAt))
                .limit(remaining);

            jobsToDispatch = [...jobsToDispatch, ...normalPriorityJobs];
        }

        if (jobsToDispatch.length === 0) {
            console.log(`[Queue] No pending jobs.`);
            return { dispatched: 0, active: activeCount };
        }

        console.log(`[Queue] Dispatching ${jobsToDispatch.length} jobs.`);

        // 4. Dispatch
        for (const job of jobsToDispatch) {
            try {
                const artwork = await db.query.artworks.findFirst({
                    where: eq(artworks.id, job.artworkId),
                    columns: { userId: true },
                });

                if (artwork) {
                    await this.dispatchJob(job.id, artwork.userId);
                } else {
                    console.error(
                        `[Queue] Artwork not found for Job ${job.id}`,
                    );
                    await db
                        .update(artworkJobs)
                        .set({
                            status: JobStatus.FAILED,
                            errorMessage:
                                "Artwork not found during queue processing",
                            updatedAt: new Date().toISOString(),
                        })
                        .where(eq(artworkJobs.id, job.id));
                }
            } catch (err) {
                console.error(`[Queue] Error dispatching job ${job.id}`, err);
            }
        }

        return {
            dispatched: jobsToDispatch.length,
            active: activeCount + jobsToDispatch.length,
        };
    }
}
