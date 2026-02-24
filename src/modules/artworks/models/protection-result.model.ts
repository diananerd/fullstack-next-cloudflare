export type StepStatus = "PENDING" | "PROCESSING" | "PASS" | "FAIL" | "SKIPPED";

export interface VerificationMeta {
    faces_detected?: number;
    confidence?: number;
    style_similarity?: number;
    decoded_uuid?: string;
    watermark_detected?: boolean;
    match?: boolean;
    psnr?: number;
    ssim?: number;
}

export interface StepResult {
    step_name: string;
    status: StepStatus;
    r2_key?: string; // Intermediate image key
    verification_meta?: any; // Flexible meta
    error?: string;
    duration_ms?: number;
}

export interface ProtectionJobResult {
    final_url?: string;
    steps: StepResult[];
    total_duration_ms?: number;
    error_message?: string;
    shieldScore?: number; // Aggregated Shield Score (0-100)
}

// STEPS_CONFIG is now derived from the Pipeline Contract.
// Import PIPELINE_LAYERS from "@/constants/pipeline-contract" instead.
// This re-export maintains backward compatibility during the transition.
export { PIPELINE_LAYERS as STEPS_CONFIG } from "@/constants/pipeline-contract";
