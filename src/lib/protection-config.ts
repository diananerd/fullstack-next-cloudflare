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
    [ProtectionMethod.MIST]: {
        urlEnvVar: "MODAL_MIST_API_URL", // Fallback to MODAL_API_URL if needed in logic
        tokenEnvVar: "MODAL_AUTH_TOKEN", // Shared token for now
        statusUrlEnvVar: "MODAL_MIST_STATUS_URL",
        description: "Adversarial Mist v2 Protection",
        defaultConfig: {
            steps: 3,
            epsilon: 0.0627,
        },
    },
    [ProtectionMethod.GRAYSCALE]: {
        urlEnvVar: "MODAL_GRAYSCALE_API_URL",
        tokenEnvVar: "MODAL_AUTH_TOKEN", // Shared token
        statusUrlEnvVar: "MODAL_GRAYSCALE_STATUS_URL",
        description: "Grayscale (Black & White) Conversion",
        defaultConfig: {},
    },
    [ProtectionMethod.WATERMARK]: {
        urlEnvVar: "MODAL_WATERMARK_API_URL",
        tokenEnvVar: "MODAL_AUTH_TOKEN",
        statusUrlEnvVar: "MODAL_WATERMARK_STATUS_URL",
        description: "Visible Watermark",
        defaultConfig: {
            text: "DRIMIT",
            opacity: 128,
            font_ratio: 0.05,
        },
    },
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
