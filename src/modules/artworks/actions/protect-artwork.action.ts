"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { type ProtectionMethodType } from "@/modules/artworks/models/artwork.enum";
import { PipelineService } from "../services/pipeline.service";
import { checkArtworkProtectionEligibility } from "./check-eligibility.action";
import { Analytics } from "@/lib/analytics";

const DASHBOARD_ROUTE = "/artworks";

export type ProtectArtworkInput = {
    artworkId: string;
    pipeline: {
        method: ProtectionMethodType;
        config?: Record<string, any>;
    }[];
};

export async function protectArtworkAction(input: ProtectArtworkInput) {
    let userId = "";
    try {
        console.log(
            `[ProtectArtworkAction] Initiating pipeline for ID ${input.artworkId} with ${input.pipeline.length} steps`,
        );
        const user = await requireAuth();
        userId = user.id;

        if (input.pipeline.length === 0) {
            return { success: false, error: "No protection methods selected" };
        }

        // Validate Credits
        const eligibility = await checkArtworkProtectionEligibility(
            user.id,
            input.pipeline,
        );
        if (!eligibility.eligible) {
            Analytics.creditsInsufficient(user.id, {
                balance: eligibility.balance,
                required: eligibility.proposedCost,
                missing: eligibility.missing,
            });
            return {
                success: false,
                error: `Insufficient credits. Please recharge your account. (Missing ${eligibility.missing.toFixed(2)} credits)`,
            };
        }

        // Delegate to Service
        // This handles validation, job creation, and initial dispatch
        await PipelineService.startPipeline(
            input.artworkId,
            user.id,
            input.pipeline,
        );

        Analytics.protectionStarted(user.id, {
            artwork_id: input.artworkId,
            layers: (input.pipeline[0]?.config?.layers as string[]) ?? [],
            intensity:
                (input.pipeline[0]?.config?.intensity as string) ?? "Medium",
            cost_credits: eligibility.proposedCost,
        });

        // --- NEW: Force Queue Processing ---
        // In the decoupled architecture, 'startPipeline' only queues the job.
        // The background cron usually picks it up.
        // To ensure immediate feedback for the user (and to work in dev environments without active crons),
        // we manually trigger the queue processor here.
        // We use catch to ensure the UI doesn't crash if the queue is busy/fails,
        // as the cron will pick it up later anyway.
        try {
            console.log(
                "[ProtectArtworkAction] Triggering immediate queue processing...",
            );
            await PipelineService.processQueue();
        } catch (queueError) {
            console.warn(
                "[ProtectArtworkAction] Immediate queue processing failed (Cron will handle it):",
                queueError,
            );
        }

        revalidatePath(DASHBOARD_ROUTE);
        return { success: true };
    } catch (error: unknown) {
        console.error(`[ProtectArtworkAction] Error:`, error);
        if (userId) {
            Analytics.captureException(userId, error, {
                artwork_id: input.artworkId,
                action: "protect_artwork",
            });
        }
        return {
            success: false,
            error:
                (error as Error).message ||
                "Failed to start protection process",
        };
    }
}
