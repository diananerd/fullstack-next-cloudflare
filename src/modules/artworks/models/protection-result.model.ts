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

export const STEPS_CONFIG = [
    {
        key: "layer_1_identity",
        label: "Identity Shield",
        description: "Biometric disruption (Anti-FaceNet)",
        icon: "UserX",
    },
    {
        key: "layer_2_mimicry",
        label: "Style Poison",
        description: "Concept/Style poisoning (Anti-LoRA)",
        icon: "Palette",
    },
    {
        key: "layer_3_editing",
        label: "Edit Immunity",
        description: "Diffusion immunization (Anti-Inpainting)",
        icon: "Edit3",
    },
    {
        key: "layer_4_watermark",
        label: "Watermark",
        description: "Invisible attribution (DCT)",
        icon: "Fingerprint",
    },
] as const;
