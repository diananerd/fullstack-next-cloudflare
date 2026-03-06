/**
 * Pipeline Contract — Single source of truth for the Drimit pipeline.
 *
 * ALL downstream files derive from this:
 *   - protect-artwork-dialog.tsx  → renders layers from PIPELINE_LAYERS
 *   - protection-audit-trail.tsx  → renders metrics from verificationMetrics
 *   - dispatch-job.ts             → maps layerKey → pythonFlag automatically
 *
 * To add a new layer: add an entry here, then add the Python flag/logic.
 * The UI updates automatically.
 */

export type MetricFormat =
    | "count"
    | "percent"
    | "decimal"
    | "boolean"
    | "code"
    | "text";
export type GoodCondition = "zero" | "nonzero" | "low" | "high" | "always";

export interface VerificationMetricConfig {
    key: string;
    label: string;
    format: MetricFormat;
    goodWhen?: GoodCondition;
    /** For "low" / "high" comparisons */
    threshold?: number;
}

export interface ConfigFieldText {
    key: string;
    type: "text";
    label: string;
    maxLength?: number;
    placeholder?: string;
    /** JS regex string (without delimiters) */
    regex?: string;
    helpText?: string;
}

export interface ConfigFieldSelect {
    key: string;
    type: "select";
    label: string;
    options: { value: string; label: string }[];
    helpText?: string;
}

export interface ConfigFieldToggle {
    key: string;
    type: "toggle";
    label: string;
    defaultValue: boolean;
    helpText?: string;
}

export type ConfigField =
    | ConfigFieldText
    | ConfigFieldSelect
    | ConfigFieldToggle;

export interface PipelineLayerConfig {
    /** Step key used in StepResult.step_name — e.g. "layer_1_identity" */
    id: string;
    /** Short token in config.layers[] sent to backend — e.g. "identity" */
    layerKey: string;
    /** Python ProtectionRequest field name — e.g. "use_identity_shield" */
    pythonFlag: string;
    /** Display label (used in dialog and audit trail) */
    label: string;
    /** Technical description for the audit trail */
    description: string;
    /** User-friendly description for the dialog */
    uiDescription: string;
    /** Lucide icon name */
    icon: string;
    defaultEnabled: boolean;
    /** If true, the layer is not yet available — shown dimmed with "Soon" badge */
    comingSoon?: boolean;
    /** Metrics rendered in the audit trail after verification */
    verificationMetrics: VerificationMetricConfig[];
    /** Per-layer config fields rendered in the dialog when layer is enabled */
    configFields: ConfigField[];
}

export const PIPELINE_LAYERS: PipelineLayerConfig[] = [
    {
        id: "layer_1_identity",
        layerKey: "identity",
        pythonFlag: "use_identity_shield",
        label: "Identity Shield",
        description:
            "Biometric disruption via PGD against InsightFace / FaceNet",
        uiDescription: "Prevents AI from identifying faces in your artwork",
        icon: "UserX",
        defaultEnabled: false,
        comingSoon: true,
        verificationMetrics: [
            {
                key: "faces_detected",
                label: "Faces Detected",
                format: "count",
                goodWhen: "zero",
            },
            {
                key: "confidence",
                label: "Detection Confidence",
                format: "percent",
                goodWhen: "always",
            },
            {
                key: "confidence_drop",
                label: "Confidence Drop",
                format: "percent",
                goodWhen: "high",
                threshold: 0.3,
            },
            {
                key: "protection_score",
                label: "Protection Score",
                format: "percent",
                goodWhen: "high",
                threshold: 0.7,
            },
        ],
        configFields: [
            {
                key: "identity_legacy",
                type: "toggle",
                label: "Include VGGFace2 legacy proxy",
                defaultValue: true,
                helpText:
                    "Adds global VGGFace2 alongside the antelopev2 face-crop proxy. Covers older face recognition systems at the cost of speed.",
            },
        ],
    },
    {
        id: "layer_2_mimicry",
        layerKey: "mimicry",
        pythonFlag: "use_style_poison",
        label: "Style Poison",
        description: "Concept/style poisoning via PGD against CLIP embeddings",
        uiDescription:
            "Poisons your art style against AI imitation (LoRA / DreamBooth)",
        icon: "Palette",
        defaultEnabled: false,
        comingSoon: true,
        verificationMetrics: [
            {
                key: "style_similarity",
                label: "Style Similarity",
                format: "decimal",
                goodWhen: "low",
                threshold: 0.3,
            },
            {
                key: "flux_vae_latent_drift",
                label: "FLUX Latent Drift",
                format: "decimal",
                goodWhen: "high",
                threshold: 0.02,
            },
            {
                key: "visual_quality_psnr",
                label: "Visual Quality (PSNR dB)",
                format: "decimal",
                goodWhen: "high",
                threshold: 28,
            },
            {
                key: "protection_score",
                label: "Protection Score",
                format: "percent",
                goodWhen: "high",
                threshold: 0.7,
            },
        ],
        configFields: [
            {
                key: "mimicry_legacy",
                type: "toggle",
                label: "Include CLIP ViT-L/14 legacy proxy",
                defaultValue: true,
                helpText:
                    "Adds OpenAI CLIP ViT-L/14 alongside ViT-H/14 for older retrieval and IP-Adapter systems.",
            },
        ],
    },
    {
        id: "layer_3_editing",
        layerKey: "editing",
        pythonFlag: "use_edit_immunity",
        label: "Edit Immunity",
        description:
            "Diffusion immunization via adversarial noise against FLUX VAE + SD 1.5 VAE",
        uiDescription:
            "Disrupts AI-powered editing and inpainting of your artwork",
        icon: "Edit3",
        defaultEnabled: false,
        comingSoon: true,
        verificationMetrics: [
            {
                key: "flux_latent_disruption",
                label: "FLUX Latent Disruption",
                format: "decimal",
                goodWhen: "high",
                threshold: 0.01,
            },
            {
                key: "artifacts_metric",
                label: "Inpaint Disruption",
                format: "decimal",
                goodWhen: "high",
                threshold: 1200,
            },
            {
                key: "protection_score",
                label: "Protection Score",
                format: "percent",
                goodWhen: "high",
                threshold: 0.7,
            },
        ],
        configFields: [
            {
                key: "editing_legacy",
                type: "toggle",
                label: "Include SD 1.5 VAE legacy proxy",
                defaultValue: true,
                helpText:
                    "Adds SD 1.5 VAE alongside FLUX VAE for SD 1.x/2.x model compatibility.",
            },
        ],
    },
    {
        id: "layer_4_watermark",
        layerKey: "watermark",
        pythonFlag: "use_watermark",
        label: "Invisible Watermark",
        description:
            "Invisible attribution embedding via TrustMark steganographic encoding",
        uiDescription:
            "Embeds your identity invisibly into the image using neural steganography",
        icon: "Fingerprint",
        defaultEnabled: true,
        verificationMetrics: [
            {
                key: "watermark_detected",
                label: "Watermark Found",
                format: "boolean",
                goodWhen: "always",
            },
            { key: "decoded_uuid", label: "Decoded Payload", format: "code" },
            {
                key: "robustness_score",
                label: "Robustness Score",
                format: "percent",
                goodWhen: "high",
                threshold: 0.5,
            },
        ],
        configFields: [
            {
                key: "watermark_text",
                type: "text",
                label: "Watermark Text",
                maxLength: 25,
                placeholder: "Enter custom watermark text",
                regex: "^[a-zA-Z0-9\\sáéíóúÁÉÍÓÚñÑ.,!?-]+$",
                helpText:
                    "Embedded into the image frequency domain. Max 25 chars.",
            },
        ],
    },
];

/** Global pipeline config options (not per-layer) */
export const PIPELINE_GLOBAL_CONFIG = {
    intensity: {
        options: [
            { value: "Low", label: "Low (Better Quality)" },
            { value: "Medium", label: "Medium (Balanced)" },
            { value: "High", label: "High (Stronger Protection)" },
        ],
        default: "Medium",
        helpText:
            "Controls adversarial noise strength. Higher = stronger protection, may affect visual quality.",
    },
} as const;
