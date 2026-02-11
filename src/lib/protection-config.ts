import {
    ProtectionMethod,
    type ProtectionMethodType,
} from "@/modules/artworks/models/artwork.enum";

export interface ProtectionConfig {
    urlEnvVar: string;
    tokenEnvVar: string;
    statusUrlEnvVar: string;
    description: string;
    defaultConfig?: Record<string, any>;
}

export const PROTECTION_METHODS_CONFIG: Record<
    ProtectionMethodType,
    ProtectionConfig
> = {
    [ProtectionMethod.MIST]: { // Legacy placeholder
        urlEnvVar: "MODAL_MIST_API_URL",
        tokenEnvVar: "MODAL_AUTH_TOKEN", 
        statusUrlEnvVar: "MODAL_MIST_STATUS_URL",
        description: "Adversarial Mist v2 Protection",
        defaultConfig: {},
    },
    // Removed legacy methods (Grayscale, Watermark) as they are now consolidated or deprecated
    [ProtectionMethod.POISONING]: {
        urlEnvVar: "MODAL_POISONING_API_URL",
        tokenEnvVar: "MODAL_AUTH_TOKEN",
        statusUrlEnvVar: "MODAL_POISONING_STATUS_URL",
        description: "AI Poisoning",
        defaultConfig: {
            epsilon: 0.04,
            steps: 100,
            alpha: 0.012,
            max_res: 3840,
            apply_poison: true,
            apply_watermark: true,
            apply_visual_watermark: false,
            watermark_text: "DRIMIT SHIELD"
        },
    },
    // Placeholder to satisfy ProtectionMethodType constraint
    [ProtectionMethod.WATERMARK]: {
        urlEnvVar: "MODAL_POISONING_API_URL", // Reuse or dummy
        tokenEnvVar: "MODAL_AUTH_TOKEN",
        statusUrlEnvVar: "",
        description: "Deprecated Legacy Watermark",
        defaultConfig: {},
    }
};

export function getProtectionConfig(method: ProtectionMethodType) {
    const config = PROTECTION_METHODS_CONFIG[method];
    if (!config) {
        throw new Error(`Unknown protection method: ${method}`);
    }

    // Resolve URL from Env
    let url = process.env[config.urlEnvVar];
    let statusUrl = process.env[config.statusUrlEnvVar];

    // Backward compatibility for Mist
    if (method === ProtectionMethod.MIST) {
        if (!url) url = process.env.MODAL_API_URL;
        if (!statusUrl) statusUrl = process.env.MODAL_STATUS_URL;
    }

    const token = process.env[config.tokenEnvVar];

    if (!url) {
        console.warn(
            `[ProtectionConfig] Missing URL for method ${method} (Check ${config.urlEnvVar})`,
        );
    }

    // Auto-Infer Status URL if missing (Convention: ...-submit-protection-job -> ...-check-status)
    if (url && !statusUrl) {
        if (url.includes("submit-protection-job")) {
            statusUrl = url.replace("submit-protection-job", "check-status");
            console.log(
                `[ProtectionConfig] Inferred Status URL for ${method}: ${statusUrl}`,
            );
        }
    }

    return {
        url,
        statusUrl,
        token,
        defaultConfig: config.defaultConfig,
    };
}
