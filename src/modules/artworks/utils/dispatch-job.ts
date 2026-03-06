import { getProtectionConfig } from "@/lib/protection-config";
import type { ProtectionMethodType } from "@/modules/artworks/models/artwork.enum";
import { PIPELINE_LAYERS } from "@/constants/pipeline-contract";

interface DispatchJobInput {
    artworkId: number;
    userId: string;
    imageUrl: string;
    imageR2Key?: string; // R2 key of the original: {userId}/{sha256}/original.ext
    method: ProtectionMethodType;
    config?: Record<string, any>;
    isPreview?: boolean;
}

export async function dispatchProtectionJob(input: DispatchJobInput) {
    const {
        artworkId,
        userId,
        imageUrl,
        imageR2Key,
        method,
        config,
        isPreview,
    } = input;

    // Build the R2 public base URL so the Python kernel can construct
    // publicly-accessible URLs for intermediate artifacts (used by SimulationEngine).
    // R2_ASSET_BASE_URL is the canonical source (set in both .env.local and wrangler.jsonc).
    // CLOUDFLARE_R2_URL (raw hostname) is a dev fallback.
    const r2AssetBaseUrl =
        process.env.R2_ASSET_BASE_URL ||
        (process.env.CLOUDFLARE_R2_URL
            ? `https://${process.env.CLOUDFLARE_R2_URL}`
            : "https://assets.drimit.ai");

    // Resolve configuration and credentials
    // Note: getProtectionConfig reads from process.env, which works in Next.js server actions / API routes
    const protectionConfig = getProtectionConfig(method);
    const methodConfig = {
        ...protectionConfig.defaultConfig,
        ...(config || {}),
    };

    const modalUrl = protectionConfig.url; // Resolved URL
    const modalToken = protectionConfig.token;

    if (!modalUrl || !modalToken) {
        throw new Error(
            `Configuration missing for method ${method}. Please check server configuration.`,
        );
    }

    // Build Python flags from the Pipeline Contract — contract-driven, no hardcoding.
    // Each layer's pythonFlag is set based on whether its layerKey is in config.layers[].
    // Default: all layers enabled (backward compat when config.layers is absent).
    const layers = Array.isArray(methodConfig.layers)
        ? (methodConfig.layers as string[])
        : null;
    const layerFlagPayload = Object.fromEntries(
        PIPELINE_LAYERS.map((l) => [
            l.pythonFlag,
            layers ? layers.includes(l.layerKey) : l.defaultEnabled,
        ]),
    );

    console.log(`[Dispatch] Dispatching ${method} for ID ${artworkId}`);
    console.log(`[Dispatch] Layer flags:`, layerFlagPayload);

    const payload = {
        artwork_id: String(artworkId),
        user_id: userId,
        image_url: imageUrl,
        image_r2_key: imageR2Key ?? null,
        r2_public_base_url: r2AssetBaseUrl,
        method: method,
        config: methodConfig,
        is_preview: isPreview ?? process.env.NODE_ENV !== "production",
        ...layerFlagPayload,
    };

    const modalResponse = await fetch(modalUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${modalToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!modalResponse.ok) {
        const errText = await modalResponse.text();
        throw new Error(
            `Protection Service Failed (${modalResponse.status}): ${errText}`,
        );
    }

    const responseData = (await modalResponse.json()) as any;
    console.log(`[Dispatch] Job Dispatched. Job ID: ${responseData.job_id}`);

    return responseData.job_id as string;
}
