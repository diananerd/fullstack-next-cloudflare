import {
    eq,
    inArray,
    and,
    asc,
    desc,
    count,
    getTableColumns,
} from "drizzle-orm";
import { getDb } from "@/db";
import { entities } from "../schemas/entity.schema";
import { workspaceItems as artworkData } from "../schemas/workspace-item.schema";
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
import {
    PROTECTION_PRICING,
    DEFAULT_PROCESS_COST,
} from "@/constants/pricing.constant";
import { Analytics } from "@/lib/analytics";

// Merged artwork type (entity base + artwork subtype + userId alias)
type ArtworkRow = typeof entities.$inferSelect &
    typeof artworkData.$inferSelect & { userId: string };

/** Fetch a single artwork by entity ID (JOIN entities + artworkData). */
async function getArtworkById(
    db: Awaited<ReturnType<typeof getDb>>,
    artworkId: string,
): Promise<ArtworkRow | undefined> {
    const [row] = await db
        .select({
            ...getTableColumns(entities),
            ...getTableColumns(artworkData),
            userId: entities.createdBy,
        })
        .from(entities)
        .innerJoin(artworkData, eq(artworkData.id, entities.id))
        .where(eq(entities.id, artworkId))
        .limit(1);
    return row;
}

export class PipelineService {
    /**
     * Initializes a new protection pipeline for an artwork.
     * V2 Refactor: Always starts a Unified Shield Pipeline.
     */
    static async startPipeline(
        artworkId: string,
        userId: string,
        pipeline: { method: ProtectionMethodType; config?: any }[],
    ) {
        const db = await getDb();

        // 1. Validate Artwork State
        const artwork = await getArtworkById(db, artworkId);
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
        const now = new Date().toISOString();
        const mainConfig = pipeline[0]?.config || {};

        try {
            const [insertedJob] = await db
                .insert(artworkJobs)
                .values({
                    artworkId: artworkId,
                    method: ProtectionMethod.SHIELD,
                    config: mainConfig,
                    stepOrder: 0,
                    inputUrl: artwork.url ?? "",
                    status: JobStatus.PENDING,
                    createdAt: now,
                    updatedAt: now,
                })
                .returning();

            await db
                .update(artworkData)
                .set({
                    protectionStatus: ProtectionStatus.QUEUED,
                    metadata: metadata,
                })
                .where(eq(artworkData.id, artworkId));

            await db
                .update(entities)
                .set({ updatedAt: now })
                .where(eq(entities.id, artworkId));

            console.log(`[Pipeline] Job ${insertedJob.id} queued (SHIELD V2).`);
        } catch (error) {
            console.error("[Pipeline] Start failed:", error);
            await db
                .update(artworkData)
                .set({
                    protectionStatus: ProtectionStatus.FAILED,
                    metadata: { ...metadata, error: String(error) },
                })
                .where(eq(artworkData.id, artworkId));
            throw error;
        }
    }

    static async resumePipeline(
        artworkId: string,
        userId: string,
    ): Promise<void> {
        const db = await getDb();
        const [job] = await db
            .select()
            .from(artworkJobs)
            .where(eq(artworkJobs.artworkId, artworkId))
            .orderBy(desc(artworkJobs.createdAt))
            .limit(1);

        if (job && job.status !== JobStatus.COMPLETED) {
            console.log(`[Pipeline] Resuming Job ${job.id}`);
            await db
                .update(artworkJobs)
                .set({
                    status: JobStatus.PENDING,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(artworkJobs.id, job.id));

            await db
                .update(artworkData)
                .set({ protectionStatus: ProtectionStatus.QUEUED })
                .where(eq(artworkData.id, artworkId));
        }
    }

    static async dispatchJob(jobId: number, userId: string) {
        const db = await getDb();
        const [job] = await db
            .select()
            .from(artworkJobs)
            .where(eq(artworkJobs.id, jobId))
            .limit(1);

        if (!job || job.status !== JobStatus.PENDING) return;

        console.log(`[Pipeline] Dispatching Job ${jobId} (SHIELD)`);

        const [artworkR2] = await db
            .select({ r2Key: artworkData.r2Key })
            .from(artworkData)
            .where(eq(artworkData.id, job.artworkId))
            .limit(1);

        try {
            const externalId = await dispatchProtectionJob({
                artworkId: job.artworkId,
                userId: userId,
                imageUrl: job.inputUrl,
                imageR2Key: artworkR2?.r2Key ?? undefined,
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
                .update(artworkData)
                .set({
                    protectionStatus: ProtectionStatus.PROCESSING,
                })
                .where(eq(artworkData.id, job.artworkId));

            await db
                .update(entities)
                .set({ updatedAt: new Date().toISOString() })
                .where(eq(entities.id, job.artworkId));
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

            await db
                .update(artworkData)
                .set({ protectionStatus: ProtectionStatus.FAILED })
                .where(eq(artworkData.id, job.artworkId));
        }
    }

    static async syncRunningJobs(targetArtworkId?: string) {
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

        const validJobs = [];
        for (const j of activeJobs) {
            const elapsedMinutes =
                (Date.now() - new Date(j.updatedAt).getTime()) / (1000 * 60);

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

                await db
                    .update(artworkData)
                    .set({ protectionStatus: ProtectionStatus.FAILED })
                    .where(eq(artworkData.id, j.artworkId));
                continue;
            }
            validJobs.push(j);
        }

        if (validJobs.length === 0) return { synced: 0 };

        const artworkIds = validJobs.map((j) => String(j.artworkId));
        const jobMap = new Map(validJobs.map((j) => [String(j.artworkId), j]));

        const config = getProtectionConfig(ProtectionMethod.SHIELD);
        if (!config.statusUrl) return { synced: 0 };

        try {
            const response = await fetch(config.statusUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(config.token
                        ? { Authorization: `Bearer ${config.token}` }
                        : {}),
                },
                body: JSON.stringify({ artwork_ids: artworkIds }),
            });

            if (!response.ok)
                throw new Error(`Status Check Failed: ${response.status}`);

            const results = await response.json();
            const updates = [];

            for (const [artId, state] of Object.entries(
                results as Record<string, any>,
            )) {
                const job = jobMap.get(artId);
                if (!job) continue;

                const status = (state.status || "").toLowerCase();
                const result = state.result || {};

                if (status === "completed") {
                    console.log(`[Pipeline] Job ${job.id} COMPLETED.`);

                    const steps = result.steps || [];
                    const finalUrl = result.final_url;
                    const shieldScore = result.shield_score || 0;

                    updates.push(
                        db
                            .update(artworkJobs)
                            .set({
                                status: JobStatus.COMPLETED,
                                outputUrl: finalUrl,
                                result: { steps, shieldScore },
                                currentStep: "COMPLETED",
                                updatedAt: new Date().toISOString(),
                            })
                            .where(eq(artworkJobs.id, job.id)),
                    );

                    const cost =
                        PROTECTION_PRICING[ProtectionMethod.SHIELD]?.cost ??
                        DEFAULT_PROCESS_COST;
                    let artwork: ArtworkRow | undefined;

                    try {
                        artwork = await getArtworkById(db, job.artworkId);

                        const updatedMetadata = {
                            ...((artwork?.metadata as any) || {}),
                            shieldScore,
                            steps_summary: steps.map((s: any) => ({
                                name: s.step_name,
                                status: s.status,
                            })),
                            completedAt: new Date().toISOString(),
                            verificationReport: steps,
                        };

                        if (artwork) {
                            await db
                                .update(artworkData)
                                .set({
                                    metadata: updatedMetadata,
                                    protectionStatus: ProtectionStatus.DONE,
                                })
                                .where(eq(artworkData.id, job.artworkId));

                            await db
                                .update(entities)
                                .set({ updatedAt: new Date().toISOString() })
                                .where(eq(entities.id, job.artworkId));

                            void Analytics.protectionCompleted(artwork.userId, {
                                artwork_id: job.artworkId,
                                shield_score: shieldScore,
                                duration_ms: result.total_duration_ms,
                                layers_passed: steps.filter(
                                    (s: any) => s.status === "PASS",
                                ).length,
                                layers_failed: steps.filter(
                                    (s: any) => s.status === "FAIL",
                                ).length,
                            });

                            await CreditService.chargeCredits(
                                artwork.userId,
                                cost,
                                "Drimit Protection",
                                `shield_${job.id}`,
                                { artworkId: job.artworkId },
                            );
                        }
                    } catch (e) {
                        console.error(
                            `[Pipeline] Charge failed for ${job.artworkId}:`,
                            e,
                        );
                        void Analytics.captureException(
                            artwork?.userId ?? "unknown",
                            e,
                            {
                                action: "charge_credits",
                                artwork_id: job.artworkId,
                                job_id: job.id,
                            },
                        );
                    }
                } else if (status === "failed" || status === "error") {
                    console.warn(
                        `[Pipeline] Job ${job.id} FAILED: ${state.error}`,
                    );
                    updates.push(
                        db
                            .update(artworkJobs)
                            .set({
                                status: JobStatus.FAILED,
                                errorMessage: state.error || "Unknown Error",
                                updatedAt: new Date().toISOString(),
                            })
                            .where(eq(artworkJobs.id, job.id)),
                    );

                    const failedArtwork = await getArtworkById(
                        db,
                        job.artworkId,
                    );
                    if (failedArtwork?.userId) {
                        void Analytics.protectionFailed(failedArtwork.userId, {
                            artwork_id: job.artworkId,
                            error: state.error || "Unknown Error",
                        });
                    }
                    updates.push(
                        db
                            .update(artworkData)
                            .set({
                                protectionStatus: ProtectionStatus.FAILED,
                                metadata: {
                                    ...((failedArtwork?.metadata as any) || {}),
                                    error: state.error,
                                },
                            })
                            .where(eq(artworkData.id, job.artworkId)),
                    );
                } else {
                    const steps = state.result?.steps || state.steps;
                    if (steps) {
                        updates.push(
                            db
                                .update(artworkJobs)
                                .set({
                                    result: steps,
                                    updatedAt: new Date().toISOString(),
                                    ...(status === "processing"
                                        ? { status: JobStatus.PROCESSING }
                                        : {}),
                                })
                                .where(eq(artworkJobs.id, job.id)),
                        );
                    }
                }
            }

            await Promise.all(updates);
        } catch (e) {
            console.error("[Pipeline] Sync Error:", e);
            void Analytics.captureException("system", e, {
                action: "sync_running_jobs",
            });
        }

        return { synced: validJobs.length };
    }

    static async processQueue() {
        const db = await getDb();

        const activeCount = (
            await db
                .select({ count: count() })
                .from(artworkJobs)
                .where(
                    inArray(artworkJobs.status, [
                        JobStatus.QUEUED,
                        JobStatus.PROCESSING,
                    ]),
                )
        )[0].count;

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
                const [entityRow] = await db
                    .select({ userId: entities.createdBy })
                    .from(entities)
                    .where(eq(entities.id, job.artworkId))
                    .limit(1);

                if (entityRow) {
                    await this.dispatchJob(job.id, entityRow.userId);
                }
            } catch (e) {
                console.error(`[Queue] Failed to dispatch job ${job.id}`, e);
            }
        }

        return {
            dispatched: pendingJobs.length,
            active: activeCount + pendingJobs.length,
        };
    }

    static async advancePipelines() {
        return { advancements: 0 };
    }
}
