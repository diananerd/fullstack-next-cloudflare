"use server";

import { eq, inArray, and } from "drizzle-orm";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import {
    ProtectionStatus,
    type ProtectionMethodType,
    ProtectionMethod,
} from "@/modules/artworks/models/artwork.enum";
import {
    PROTECTION_PRICING,
    DEFAULT_PROCESS_COST,
} from "@/constants/pricing.constant";
import { CreditService } from "@/modules/credits/services/credit.service";
import { requireAuth } from "@/modules/auth/utils/auth-utils";

export async function checkArtworkProtectionEligibility(
    userId: string,
    proposedPipeline: { method: ProtectionMethodType; config?: any }[],
) {
    // 1. Calculate cost of the Shield V2 Pipeline
    // The unified pipeline has a fixed cost per execution, regardless of intensity config.
    const proposedCost = proposedPipeline.reduce((acc, step) => {
        // Handle V2 Shield Method
        if (step.method === ProtectionMethod.SHIELD) {
            const price = PROTECTION_PRICING[ProtectionMethod.SHIELD];
            if (!price) {
                // Fallback if constant is missing
                console.warn(
                    "Pricing missing for SHIELD method, using default cost",
                );
                return acc + DEFAULT_PROCESS_COST;
            }
            return acc + price.cost;
        }

        // Legacy Fallback (should be unused)
        const price = PROTECTION_PRICING[step.method] || {
            cost: DEFAULT_PROCESS_COST,
        };
        return acc + price.cost;
    }, 0);

    // 2. Get User Balance
    const balance = await CreditService.getBalance(userId);

    // 3. Calculate "Committed" credits from active jobs
    // Active jobs are those that will eventually result in a charge (on completion)
    const db = await getDb();
    // Only QUEUED and PROCESSING artworks have an active pipeline that will result in a charge.
    // UPLOADING = image upload in progress, no pipeline started yet — does NOT count.
    const activeArtworks = await db.query.artworks.findMany({
        where: and(
            eq(artworks.userId, userId),
            inArray(artworks.protectionStatus, [
                ProtectionStatus.QUEUED,
                ProtectionStatus.PROCESSING,
            ]),
        ),
        columns: {
            id: true,
            metadata: true,
        },
    });

    let committedCost = 0;

    for (const art of activeArtworks) {
        const meta = art.metadata as any;
        if (meta?.pipeline?.steps) {
            // Legacy format: pipeline stored as an array of steps
            const pipelineCost = (meta.pipeline.steps as any[]).reduce(
                (acc, step) => {
                    const price = PROTECTION_PRICING[step.method] || {
                        cost: DEFAULT_PROCESS_COST,
                    };
                    return acc + price.cost;
                },
                0,
            );
            committedCost += pipelineCost;
        } else if (meta?.pipeline?.method) {
            // V2 format: unified pipeline with a single method (e.g. "shield")
            const price =
                PROTECTION_PRICING[
                    meta.pipeline.method as ProtectionMethodType
                ];
            committedCost += price?.cost ?? DEFAULT_PROCESS_COST;
        } else {
            // No recognizable pipeline metadata — use safe default
            committedCost += DEFAULT_PROCESS_COST;
        }
    }

    const available = balance - committedCost;
    const missing = proposedCost - available;

    return {
        eligible: available >= proposedCost,
        balance,
        committedCost,
        proposedCost,
        missing: missing > 0 ? missing : 0,
    };
}
