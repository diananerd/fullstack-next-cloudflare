import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface UploadResult {
    success: boolean;
    url?: string;
    key?: string;
    error?: string;
}

export async function uploadToR2(
    file: File,
    folder: string = "uploads",
    customFilename?: string,
    envOverride?: Cloudflare.Env
): Promise<UploadResult> {
    try {
        let env: Cloudflare.Env;
        if (envOverride) {
            env = envOverride;
        } else {
             const context = await getCloudflareContext();
             env = context.env as unknown as Cloudflare.Env;
        }

        const extension = file.name.split(".").pop() || "bin";
        let key: string;

        if (customFilename) {
            key = `${folder}/${customFilename}.${extension}`;
        } else {
            // Generate unique filename
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substring(2, 15);
            key = `${folder}/${timestamp}_${randomId}.${extension}`;
        }

        // Convert File to ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        console.log(`[R2] Uploading ${key} (${arrayBuffer.byteLength} bytes) to bucket`);

        // Upload to R2
        // !starterconf - update this to match your R2 bucket binding name
        // change "next_cf_app_bucket" to your R2 bucket binding name on `wrangler.jsonc`
        const result = await env.drimit_shield_bucket.put(key, arrayBuffer, {
            httpMetadata: {
                contentType: file.type,
                cacheControl: "public, max-age=31536000", // 1 year
            },
            customMetadata: {
                originalName: file.name,
                uploadedAt: new Date().toISOString(),
                size: file.size.toString(),
            },
        });

        if (!result) {
            console.error(`[R2] Upload FAILED for ${key}`);
            return {
                success: false,
                error: "Upload failed",
            };
        }
        
        console.log(`[R2] Upload SUCCESS for ${key}`);

        // Return URL proxied through the application
        // biome-ignore lint/suspicious/noExplicitAny: Env variables not typed in Cloudflare types yet
        const appUrl =
            (env as any).NEXT_PUBLIC_APP_URL || "https://shield.drimit.io";
        const publicUrl = `${appUrl}/api/assets/${key}`;

        return {
            success: true,
            url: publicUrl,
            key: key,
        };
    } catch (error) {
        console.error("R2 upload error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Upload failed",
        };
    }
}

export async function getFromR2(key: string, envOverride?: Cloudflare.Env): Promise<R2Object | null> {
    try {
        let env: Cloudflare.Env;
        if (envOverride) {
            env = envOverride;
        } else {
             const context = await getCloudflareContext();
             env = context.env as unknown as Cloudflare.Env;
        }
        return env.drimit_shield_bucket.get(key);
    } catch (error) {
        console.error("Error getting data from R2", error);
        return null;
    }
}

export async function deleteFromR2(key: string, envOverride?: Cloudflare.Env): Promise<boolean> {
    try {
        let env: Cloudflare.Env;
        if (envOverride) {
            env = envOverride;
        } else {
             const context = await getCloudflareContext();
             env = context.env as unknown as Cloudflare.Env;
        }
        await env.drimit_shield_bucket.delete(key);
        return true;
    } catch (error) {
        console.error("Delete from R2 error:", error);
        return false;
    }
}

export async function listR2Files() {}
