import { ProtectionMethod, type ProtectionMethodType } from "@/modules/artworks/models/artwork.enum";

export interface ProtectionConfig {
    urlEnvVar: string;
    tokenEnvVar: string;
    description: string;
    defaultConfig?: Record<string, any>;
}

export const PROTECTION_METHODS_CONFIG: Record<ProtectionMethodType, ProtectionConfig> = {
    [ProtectionMethod.MIST]: {
        urlEnvVar: "MODAL_MIST_API_URL", // Fallback to MODAL_API_URL if needed in logic
        tokenEnvVar: "MODAL_AUTH_TOKEN", // Shared token for now
        description: "Adversarial Mist v2 Protection",
        defaultConfig: {
            steps: 3,
            epsilon: 0.0627,
        },
    },
    [ProtectionMethod.GRAYSCALE]: {
        urlEnvVar: "MODAL_GRAYSCALE_API_URL", 
        tokenEnvVar: "MODAL_AUTH_TOKEN", // Shared token
        description: "Grayscale (Black & White) Conversion",
        defaultConfig: {},
    },
    [ProtectionMethod.WATERMARK]: {
        urlEnvVar: "MODAL_WATERMARK_API_URL",
        tokenEnvVar: "MODAL_AUTH_TOKEN",
        description: "Visible Watermark",
        defaultConfig: {
            text: "DRIMIT AI SHIELD",
            opacity: 128,
            font_ratio: 0.05
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
    
    // Backward compatibility for Mist
    if (method === ProtectionMethod.MIST && !url) {
        url = process.env.MODAL_API_URL;
    }

    const token = process.env[config.tokenEnvVar];

    if (!url) {
        console.warn(`[ProtectionConfig] Missing URL for method ${method} (Check ${config.urlEnvVar})`);
    }

    return {
        url,
        token,
        defaultConfig: config.defaultConfig,
    };
}
