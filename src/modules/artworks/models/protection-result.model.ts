export type StepStatus =
    | "PENDING"
    | "PROCESSING"
    | "PASS"
    | "FAIL"
    | "SKIPPED"
    | "ERROR";

/** Flat metrics present in all v2/v3 verification_meta objects. */
export interface VerificationMeta {
    // Shared
    status?: string;
    protection_score?: number;
    art_type?: string;
    attack_label?: string;
    attack_description?: string;

    // L1 — Identity Shield
    faces_detected?: number;
    confidence?: number;
    confidence_drop?: number;
    /** v3 dual-run model entries */
    latest?: Record<string, unknown>;
    legacy?: Record<string, unknown>;

    // L2 — Style Poison
    style_similarity?: number;
    flux_vae_latent_drift?: number;
    visual_quality_psnr?: number;

    // L3 — Edit Immunity
    flux_latent_disruption?: number;
    artifacts_metric?: number;
    flux_vae_proxy?: Record<string, unknown>;

    // L4 — Watermark
    watermark_detected?: boolean;
    decoded_uuid?: string;
    robustness_score?: number;
    direct?: { detected?: boolean; match?: boolean };
    jpeg_80?: { detected?: boolean; match?: boolean };
    jpeg_60?: { detected?: boolean; match?: boolean };
    vae_pass?: { detected?: boolean; match?: boolean };
    bilateral?: { detected?: boolean; match?: boolean };
    baseline?: { trustmark_detected?: boolean; decoded?: string };
}

export interface StepResult {
    step_name: string;
    status: StepStatus;
    r2_key?: string; // Intermediate image key (protected image artifact)
    r2_key_original?: string; // R2 key of original-image verification artifact (v3)
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
