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
    ProtectionMethod,
} from "../models/artwork.enum";
import { dispatchProtectionJob } from "../utils/dispatch-job";
import { getProtectionConfig } from "@/lib/protection-config";
import { deleteFromR2, cleanDirectoryExcept } from "@/lib/r2";
import { CreditService } from "@/modules/credits/services/credit.service";
import { PROTECTION_PRICING } from "@/constants/pricing.constant";
import { Analytics } from "@/lib/analytics";

export class PipelineService {
    /**
     * Initializes a new protection pipeline for an artwork.
     * V2 Refactor: Always starts a Unified Shield Pipeline.
     */
    static async startPipeline(
        artworkId: number,
        userId: string,
        // Config is passed, but method is implied as SHIELD for V2,
        // though we support passing it for future proofing.
        pipeline: { method: ProtectionMethodType; config?: any }[],
    ) {
        const db = await getDb();

        // 1. Validate Artwork State
        const artwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
        });

        if (!artwork) throw new Error("Artwork not found");

        // 2. Hard Reset / Cleanup Logic
        const allPreviousJobs = await db
            .select()
            .from(artworkJobs)
            .where(eq(artworkJobs.artworkId, artworkId));

        if (allPreviousJobs.length > 0) {
            console.log(
                `[Pipeline] Hard Reset: Cleaning up ${allPreviousJobs.length} previous jobs for artwork ${artworkId}.`,
            );

            // A. Directory Cleanup (Force Clean)
            if (artwork.r2Key) {
                const lastSlash = artwork.r2Key.lastIndexOf("/");
                if (lastSlash !== -1) {
                    const prefix = artwork.r2Key.substring(0, lastSlash + 1);
                    if (prefix.length > 10) {
                        try {
                            await cleanDirectoryExcept(prefix, [artwork.r2Key]);
                        } catch (e) {
                            console.error("[Pipeline] Cleanup error:", e);
                        }
                    }
                }
            }

            // B. Invalidate DB Rows
            await db
                .update(artworkJobs)
                .set({
                    status: JobStatus.FAILED,
                    errorMessage: "Superseded by new request.",
                    updatedAt: new Date().toISOString(),
                })
                .where(
                    inArray(
                        artworkJobs.id,
                        allPreviousJobs.map((j) => j.id),
                    ),
                );
        }

        // 3. Prepare Metadata
        // Clear old reports
        const baseMetadata = (artwork.metadata as Record<string, any>) || {};
        const { verificationReport, error, ...keptMetadata } = baseMetadata;

        const metadata = {
            ...keptMetadata,
            pipeline: {
                method: ProtectionMethod.SHIELD,
                config: pipeline[0]?.config || {},
                startedAt: new Date().toISOString(),
            },
        };

        // 4. Create Single Shield Job
        // V2 Unified Pipeline = 1 Job Record
        const now = new Date().toISOString();
        const mainConfig = pipeline[0]?.config || {};

        try {
            const [insertedJob] = await db
                .insert(artworkJobs)
                .values({
                    artworkId: artworkId,
                    method: ProtectionMethod.SHIELD, // Enforce Shield
                    config: mainConfig,
                    stepOrder: 0,
                    inputUrl: artwork.url,
                    status: JobStatus.PENDING,
                    createdAt: now,
                    updatedAt: now,
                })
                .returning();

            // 5. Update Artwork Status
            await db
                .update(artworks)
                .set({
                    protectionStatus: ProtectionStatus.QUEUED,
                    metadata: metadata,
                    updatedAt: now,
                })
                .where(eq(artworks.id, artworkId));

            console.log(
                `[Pipeline] Job ${insertedJob.id} queued (SHIELD V2).`,
            );

            // 6. Trigger Process Queue (Optional immediate attempt)
            // await this.processQueue(); 
        } catch (error) {
            console.error("[Pipeline] Start failed:", error);
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
     * Resumes or Restarts a pipeline.
     */
    static async resumePipeline(
        artworkId: number,
        userId: string,
    ): Promise<void> {
        // Simplified Resume: Just restart the last job if failed/stuck
        const db = await getDb();
        const jobs = await db
            .select()
            .from(artworkJobs)
            .where(eq(artworkJobs.artworkId, artworkId))
            .orderBy(desc(artworkJobs.createdAt))
            .limit(1);

        if (jobs.length > 0) {
            const job = jobs[0];
            if (job.status !== JobStatus.COMPLETED) {
                console.log(`[Pipeline] Resuming Job ${job.id}`);
                await db
                    .update(artworkJobs)
                    .set({
                        status: JobStatus.PENDING,
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(artworkJobs.id, job.id));
                    
                await db
                    .update(artworks)
                    .set({ protectionStatus: ProtectionStatus.QUEUED })
                    .where(eq(artworks.id, artworkId));
            }
        }
    }

    /**
     * Dispatches a specific Job to Modal.
     */
    static async dispatchJob(jobId: number, userId: string) {
        const db = await getDb();
        const job = await db.query.artworkJobs.findFirst({
            where: eq(artworkJobs.id, jobId),
        });

        if (!job || job.status !== JobStatus.PENDING) return;

        console.log(`[Pipeline] Dispatching Job ${jobId} (SHIELD)`);

        // Fetch artwork r2Key so Python can derive the correct output path prefix.
        // Convention: {userId}/{sha256}/original.ext → output goes to {userId}/{sha256}/
        const artwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, job.artworkId),
            columns: { r2Key: true },
        });

        try {
            const externalId = await dispatchProtectionJob({
                artworkId: job.artworkId,
                userId: userId,
                imageUrl: job.inputUrl,
                imageR2Key: artwork?.r2Key,
                method: job.method as ProtectionMethodType,
                config: job.config,
            });

            await db
                .update(artworkJobs)
                .set({
                    status: JobStatus.QUEUED,
                    externalId: externalId,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(artworkJobs.id, jobId));

            await db
                .update(artworks)
                .set({
                    protectionStatus: ProtectionStatus.PROCESSING,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(artworks.id, job.artworkId));
        } catch (error) {
            console.error(`[Pipeline] Dispatch Error Job ${jobId}:`, error);
            void Analytics.captureException(userId, error, {
                action: "dispatch_job",
                job_id: jobId,
            });
            await db
                .update(artworkJobs)
                .set({
                    status: JobStatus.FAILED,
                    errorMessage: String(error),
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(artworkJobs.id, jobId));
        }
    }

    /**
     * Main Orchestration: Sync Statuses
     * V2 Refactor: Optimized for multiple artworks in one batch.
     */
    static async syncRunningJobs(targetArtworkId?: number) {
        const db = await getDb();

        const conditions = [
            inArray(artworkJobs.status, [
                JobStatus.QUEUED,
                JobStatus.PROCESSING,
            ]),
        ];

        if (targetArtworkId) {
            conditions.push(eq(artworkJobs.artworkId, targetArtworkId));
        }

        const activeJobs = await db
            .select()
            .from(artworkJobs)
            .where(and(...conditions))
            .limit(100);

        if (activeJobs.length === 0) return { synced: 0 };

        console.log(`[Pipeline] Syncing ${activeJobs.length} active jobs`);

        // Filter Zombies
        const validJobs = [];
        for (const j of activeJobs) {
            const lastUpdate = new Date(j.updatedAt).getTime();
            const elapsedMinutes = (Date.now() - lastUpdate) / (1000 * 60);

            if (elapsedMinutes > JOB_TIMEOUT_MINUTES) {
                console.warn(`[Pipeline] Job ${j.id} Timed Out.`);
                await db
                    .update(artworkJobs)
                    .set({
                        status: JobStatus.FAILED,
                        errorMessage: "Timeout",
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(artworkJobs.id, j.id));
                
                await db.update(artworks)
                    .set({ protectionStatus: ProtectionStatus.FAILED })
                    .where(eq(artworks.id, j.artworkId));
                continue;
            }
            validJobs.push(j);
        }

        if (validJobs.length === 0) return { synced: 0 };

        // Group by Artworks for Modal Query
        // We assume all are SHIELD method for V2.
        const artworkIds = validJobs.map(j => String(j.artworkId));
        const jobMap = new Map(validJobs.map(j => [String(j.artworkId), j]));

        const config = getProtectionConfig(ProtectionMethod.SHIELD);
        if (!config.statusUrl) return { synced: 0 };

        try {
            const response = await fetch(config.statusUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
                },
                body: JSON.stringify({ artwork_ids: artworkIds }),
            });

            if (!response.ok) throw new Error(`Status Check Failed: ${response.status}`);

            const results = await response.json();
            const updates = [];

            for (const [artId, state] of Object.entries(results as Record<string, any>)) {
                const job = jobMap.get(artId);
                if (!job) continue;

                const status = (state.status || "").toLowerCase();
                const result = state.result || {};

                if (status === "completed") {
                    console.log(`[Pipeline] Job ${job.id} COMPLETED.`);
                    
                    const steps = result.steps || [];
                    const finalUrl = result.final_url;
                    const shieldScore = result.shield_score || 0; // Capture aggregated score
                    
                    // 1. Update Job
                    updates.push(
                        db.update(artworkJobs).set({
                            status: JobStatus.COMPLETED,
                            outputUrl: finalUrl,
                            result: { steps, shieldScore }, // Store rich result json
                            currentStep: "COMPLETED",
                            updatedAt: new Date().toISOString(),
                        }).where(eq(artworkJobs.id, job.id))
                    );

                    // 2. Finalize Artwork & Charge
                    const cost = PROTECTION_PRICING[ProtectionMethod.SHIELD]?.cost || 1.0;
                    // Declared outside try so catch can reference it for error reporting
                    let artwork: Awaited<ReturnType<typeof db.query.artworks.findFirst>> | undefined;

                    try {
                        artwork = await db.query.artworks.findFirst({
                             where: eq(artworks.id, job.artworkId)
                        });
                        
                        // Merge result into artwork metadata for easy frontend access
                        const updatedMetadata = {
                            ...(artwork?.metadata as any || {}),
                            shieldScore: shieldScore,
                            steps_summary: steps.map((s: any) => ({ name: s.step_name, status: s.status })),
                            completedAt: new Date().toISOString()
                        };
                        
                        if (artwork) {
                             // Update Metadata on Artwork (includes verificationReport)
                             const finalMetadata = {
                                 ...updatedMetadata,
                                 verificationReport: steps,
                             };
                             await db.update(artworks).set({
                                 metadata: finalMetadata,
                                 protectionStatus: ProtectionStatus.DONE,
                                 updatedAt: new Date().toISOString()
                             }).where(eq(artworks.id, job.artworkId));

                             void Analytics.protectionCompleted(artwork.userId, {
                                 artwork_id: job.artworkId,
                                 shield_score: shieldScore,
                                 duration_ms: result.total_duration_ms,
                                 layers_passed: steps.filter((s: any) => s.status === "PASS").length,
                                 layers_failed: steps.filter((s: any) => s.status === "FAIL").length,
                             });

                             await CreditService.chargeCredits(
                                artwork.userId,
                                cost,
                                "Drimit Shield Protection",
                                `shield_${job.id}`,
                                { artworkId: job.artworkId }
                            );
                        }
                    } catch (e) {
                        console.error(`[Pipeline] Charge failed for ${job.artworkId}:`, e);
                        void Analytics.captureException(artwork?.userId ?? "unknown", e, {
                            action: "charge_credits",
                            artwork_id: job.artworkId,
                            job_id: job.id,
                        });
                    }

                } else if (status === "failed" || status === "error") {
                     console.warn(`[Pipeline] Job ${job.id} FAILED: ${state.error}`);
                     updates.push(
                        db.update(artworkJobs).set({
                            status: JobStatus.FAILED,
                            errorMessage: state.error || "Unknown Error",
                            updatedAt: new Date().toISOString(),
                        }).where(eq(artworkJobs.id, job.id))
                    );
                    const failedArtwork = await db.query.artworks.findFirst({ where: eq(artworks.id, job.artworkId) });
                    if (failedArtwork?.userId) {
                        void Analytics.protectionFailed(failedArtwork.userId, {
                            artwork_id: job.artworkId,
                            error: state.error || "Unknown Error",
                        });
                    }
                    updates.push(
                         db.update(artworks).set({
                            protectionStatus: ProtectionStatus.FAILED,
                            metadata: {
                                ...(failedArtwork?.metadata as any),
                                error: state.error
                            }
                        }).where(eq(artworks.id, job.artworkId))
                    );
                } else {
                    // Running / Processing
                    // Update progress (steps)
                    const steps = state.result?.steps || state.steps;
                    if (steps) {
                         updates.push(
                            db.update(artworkJobs).set({
                                result: steps,
                                updatedAt: new Date().toISOString(),
                                ...(status === "processing" ? { status: JobStatus.PROCESSING } : {})
                            }).where(eq(artworkJobs.id, job.id))
                        );
                    }
                }
            }
            
            await Promise.all(updates);

        } catch (e) {
            console.error("[Pipeline] Sync Error:", e);
            void Analytics.captureException("system", e, { action: "sync_running_jobs" });
        }

        return { synced: validJobs.length };
    }

    /**
     * V2 Refactor: Queue Processor
     * Simple scheduler for pending jobs.
     */
    static async processQueue() {
        const db = await getDb();

        const activeCount = (await db
            .select({ count: count() })
            .from(artworkJobs)
            .where(inArray(artworkJobs.status, [JobStatus.QUEUED, JobStatus.PROCESSING])))[0].count;

        const slots = MAX_CONCURRENT_JOBS - activeCount;
        if (slots <= 0) return { dispatched: 0, active: activeCount };

        const pendingJobs = await db
            .select()
            .from(artworkJobs)
            .where(eq(artworkJobs.status, JobStatus.PENDING))
            .orderBy(asc(artworkJobs.createdAt))
            .limit(slots);

        if (pendingJobs.length === 0) return { dispatched: 0 };

        console.log(`[Queue] Dispatching ${pendingJobs.length} jobs.`);

        for (const job of pendingJobs) {
            try {
                // Fetch userId from artwork relation for dispatch
                // Optimized: We could join in the select, but for now simple query is fine
                const artwork = await db.query.artworks.findFirst({
                    where: eq(artworks.id, job.artworkId),
                    columns: { userId: true }
                });
                
                if (artwork) {
                    await this.dispatchJob(job.id, artwork.userId);
                }
            } catch (e) {
                console.error(`[Queue] Failed to dispatch job ${job.id}`, e);
            }
        }

        return { dispatched: pendingJobs.length, active: activeCount + pendingJobs.length };
    }

    // Deprecated methods
    static async advancePipelines() { return { advancements: 0 }; }
}

