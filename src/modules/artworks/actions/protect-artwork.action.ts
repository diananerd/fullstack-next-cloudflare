"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { type ProtectionMethodType } from "@/modules/artworks/models/artwork.enum";
import { PipelineService } from "../services/pipeline.service";

const DASHBOARD_ROUTE = "/artworks";

export type ProtectArtworkInput = {
    artworkId: number;
    pipeline: {
        method: ProtectionMethodType;
        config?: Record<string, any>;
    }[];
};

export async function protectArtworkAction(input: ProtectArtworkInput) {
    try {
        console.log(
            `[ProtectArtworkAction] Initiating pipeline for ID ${input.artworkId} with ${input.pipeline.length} steps`,
        );
        const user = await requireAuth();

        if (input.pipeline.length === 0) {
            return { success: false, error: "No protection methods selected" };
        }

        // Delegate to Service
        // This handles validation, job creation, and initial dispatch
        await PipelineService.startPipeline(
            input.artworkId,
            user.id,
            input.pipeline,
        );

        revalidatePath(DASHBOARD_ROUTE);
        return { success: true };
    } catch (error: unknown) {
        console.error(`[ProtectArtworkAction] Error:`, error);
        return {
            success: false,
            error:
                (error as Error).message ||
                "Failed to start protection process",
        };
    }
}
