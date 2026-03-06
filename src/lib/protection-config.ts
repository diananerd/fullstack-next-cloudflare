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

export const PROTECTION_METHODS_CONFIG: Record<string, ProtectionConfig> = {
    [ProtectionMethod.SHIELD]: {
        urlEnvVar: "MODAL_KERNEL_API_URL",
        tokenEnvVar: "MODAL_AUTH_TOKEN",
        statusUrlEnvVar: "MODAL_KERNEL_STATUS_URL",
        description: "V2 Atomic Shield Pipeline",
        defaultConfig: {
            mode: "fast",
        },
    },
};

export function getProtectionConfig(method: ProtectionMethodType) {
    const config = PROTECTION_METHODS_CONFIG[method];
    if (!config) {
        throw new Error(`Unknown protection method: ${method}`);
    }

    // Resolve URL from Env
    const url = process.env[config.urlEnvVar];
    let statusUrl = process.env[config.statusUrlEnvVar];

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
