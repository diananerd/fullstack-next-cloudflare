
"use server";

import { eq, inArray, and } from "drizzle-orm";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { ProtectionStatus, type ProtectionMethodType } from "@/modules/artworks/models/artwork.enum";
import { PROTECTION_PRICING, DEFAULT_PROCESS_COST } from "@/constants/pricing.constant";
import { CreditService } from "@/modules/credits/services/credit.service";
import { requireAuth } from "@/modules/auth/utils/auth-utils";

export async function checkArtworkProtectionEligibility(
    userId: string,
    proposedPipeline: { method: ProtectionMethodType; config?: any }[]
) {
    // 1. Calculate cost of the proposed pipeline
    const proposedCost = proposedPipeline.reduce((acc, step) => {
        if (step.method === "poisoning") {
            // Calculate dynamic cost based on enabled features
            let cost = 0;
            const config = step.config || {};
            
            console.log(`[Eligibility] Checking pipeline step: poisoning with config:`, config);

            // Explicitly check for true to avoid implicit costs
            if (config.apply_poison === true) {
                const p = PROTECTION_PRICING["poison-ivy"];
                if (!p) throw new Error("Pricing config missing for poison-ivy");
                cost += p.cost;
            }
            if (config.apply_watermark === true) {
                const p = PROTECTION_PRICING["ai-watermark"];
                if (!p) throw new Error("Pricing config missing for ai-watermark");
                cost += p.cost;
            }
            if (config.apply_visual_watermark === true) {
                const p = PROTECTION_PRICING["visual-watermark"];
                if (!p) throw new Error("Pricing config missing for visual-watermark");
                cost += p.cost;
            }
            if (config.apply_verification === true) {
                const p = PROTECTION_PRICING["verification"];
                if (!p) throw new Error("Pricing config missing for verification");
                cost += p.cost;
            }
            
            console.log(`[Eligibility] Calculated Step Cost: ${cost}`);
            return acc + cost;
        }

        const price = PROTECTION_PRICING[step.method];
        if (!price) throw new Error(`Pricing config missing for method: ${step.method}`);
        return acc + price.cost;
    }, 0);

    // 2. Get User Balance
    const balance = await CreditService.getBalance(userId);

    // 3. Calculate "Committed" credits from active jobs
    // Active jobs are those that will eventually result in a charge (on completion)
    const db = await getDb();
    const activeArtworks = await db.query.artworks.findMany({
        where: and(
            eq(artworks.userId, userId),
            inArray(artworks.protectionStatus, [
                ProtectionStatus.QUEUED,
                ProtectionStatus.PROCESSING,
                ProtectionStatus.UPLOADING // Include uploading if it implies a pipeline start soon? Maybe not yet.
                // Actually uploading means they haven't configured the pipeline yet usually, 
                // but if the system auto-starts or if it's in a state where pipeline metadata exists.
            ])
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
            // If pipeline exists, sum up the cost of all steps
            // Since we charge at the END of the entire pipeline, the whole pipeline cost is committed.
            const pipelineCost = (meta.pipeline.steps as any[]).reduce((acc, step) => {
                const price = PROTECTION_PRICING[step.method] || { cost: DEFAULT_PROCESS_COST };
                return acc + price.cost;
            }, 0);
            committedCost += pipelineCost;
        } else {
            // Fallback if no pipeline metadata (legacy/unknown), assume default cost
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
