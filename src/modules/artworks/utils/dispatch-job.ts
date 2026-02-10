import { getProtectionConfig } from "@/lib/protection-config";
import type { ProtectionMethodType } from "@/modules/artworks/models/artwork.enum";

interface DispatchJobInput {
    artworkId: number;
    userId: string;
    imageUrl: string;
    method: ProtectionMethodType;
    config?: Record<string, any>;
    isPreview?: boolean;
}

export async function dispatchProtectionJob(input: DispatchJobInput) {
    const { artworkId, userId, imageUrl, method, config, isPreview } = input;

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

    console.log(`[Dispatch] Dispatching ${method} for ID ${artworkId}`);

    const payload = {
        artwork_id: String(artworkId),
        user_id: userId,
        image_url: imageUrl,
        method: method,
        config: methodConfig,
        is_preview: isPreview ?? process.env.NODE_ENV !== "production",
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
