import { getCloudflareContext } from "@opennextjs/cloudflare";
import { type NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/modules/auth/utils/auth-utils";

// Removing explicit edge runtime to allow for potentially Node.js compatible auth libraries
// export const runtime = "edge";

export async function GET(
    _request: NextRequest,
    props: { params: Promise<{ key: string[] }> },
) {
    try {
        const { env } = await getCloudflareContext();

        // Enterprise Security: Verify Authentication
        // 1. Allow System/Service access via Token (for Modal)
        const authHeader = _request.headers.get("Authorization");

        // Try all possible sources for the token
        const systemToken =
            (env as any).MODAL_AUTH_TOKEN || process.env.MODAL_AUTH_TOKEN;

        // Debug Logging
        console.log(`[AssetProxy] Request URL: ${_request.url}`);
        console.log(
            `[AssetProxy] Auth Header: ${authHeader ? authHeader.substring(0, 10) + "..." : "MISSING"}`,
        );
        console.log(`[AssetProxy] System Token Found: ${!!systemToken}`);

        if (!systemToken) {
            console.error(
                "[AssetProxy] CRITICIAL: MODAL_AUTH_TOKEN is missing in environment!",
            );
            console.error(
                `[AssetProxy] Env Keys: ${Object.keys(env).join(", ")}`,
            );
        }

        const isSystemRequest =
            systemToken && authHeader === `Bearer ${systemToken}`;

        if (isSystemRequest) {
            console.log("[AssetProxy] Authorized via System Token");
        } else if (authHeader && systemToken) {
            console.log(
                `[AssetProxy] Token mismatch. Header: ${authHeader.length} chars, Env: ${systemToken.length} chars`,
            );
        }

        // 2. Allow User access via Session
        let authed = false;
        if (!isSystemRequest) {
            authed = await isAuthenticated();
        }

        if (!authed && !isSystemRequest) {
            console.warn("[AssetProxy] Unauthorized access attempt");

            // Return debug info in body to help diagnose (only for 401s)
            return NextResponse.json(
                {
                    error: "Unauthorized",
                    debug: {
                        hasAuthHeader: !!authHeader,
                        authHeaderLen: authHeader ? authHeader.length : 0,
                        hasSystemToken: !!systemToken,
                        systemTokenLen: systemToken ? systemToken.length : 0,
                        envKeys: Object.keys(env || {}).filter(
                            (k) => !k.includes("SECRET") && !k.includes("KEY"),
                        ), // Safe keys
                        processEnvKeys: Object.keys(process.env || {}).filter(
                            (k) => !k.includes("SECRET") && !k.includes("KEY"),
                        ),
                    },
                },
                { status: 401 },
            );
        }

        const params = await props.params;
        const objectKey = params.key.join("/");

        if (!objectKey) {
            return new NextResponse("Key required", { status: 400 });
        }

        // Security: Ensure we are not allowing directory traversal if that were possible (R2 is flat, but good practice)
        // const sanitizedKey = objectKey.replace(/\.\./g, "");

        const object = await env.drimit_shield_bucket.get(objectKey);

        if (!object) {
            return new NextResponse("Not Found", { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);

        if (object.body) {
            return new NextResponse(object.body as ReadableStream, {
                headers,
            });
        }

        return new NextResponse(null, { status: 404 });
    } catch (e: unknown) {
        console.error("Asset Proxy Error:", e);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
