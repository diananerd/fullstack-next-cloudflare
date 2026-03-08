"use server";

import { eq, inArray, and } from "drizzle-orm";
import { getDb } from "@/db";
import { entities } from "@/modules/artworks/schemas/entity.schema";
import { workspaceItems as artworkData } from "@/modules/artworks/schemas/workspace-item.schema";
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

export async function checkArtworkProtectionEligibility(
    userId: string,
    proposedPipeline: { method: ProtectionMethodType; config?: any }[],
) {
    // 1. Calculate cost of the Shield V2 Pipeline
    const proposedCost = proposedPipeline.reduce((acc, step) => {
        if (step.method === ProtectionMethod.SHIELD) {
            const price = PROTECTION_PRICING[ProtectionMethod.SHIELD];
            if (!price) {
                console.warn(
                    "Pricing missing for SHIELD method, using default cost",
                );
                return acc + DEFAULT_PROCESS_COST;
            }
            return acc + price.cost;
        }
        const price = PROTECTION_PRICING[step.method] || {
            cost: DEFAULT_PROCESS_COST,
        };
        return acc + price.cost;
    }, 0);

    // 2. Get User Balance
    const balance = await CreditService.getBalance(userId);

    // 3. Calculate "Committed" credits from active jobs
    const db = await getDb();
    const activeArtworks = await db
        .select({ id: artworkData.id, metadata: artworkData.metadata })
        .from(entities)
        .innerJoin(artworkData, eq(artworkData.id, entities.id))
        .where(
            and(
                eq(entities.createdBy, userId),
                inArray(artworkData.protectionStatus, [
                    ProtectionStatus.QUEUED,
                    ProtectionStatus.PROCESSING,
                ]),
            ),
        );

    let committedCost = 0;

    for (const art of activeArtworks) {
        const meta = art.metadata as any;
        if (meta?.pipeline?.steps) {
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
            const price =
                PROTECTION_PRICING[
                    meta.pipeline.method as ProtectionMethodType
                ];
            committedCost += price?.cost ?? DEFAULT_PROCESS_COST;
        } else {
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
