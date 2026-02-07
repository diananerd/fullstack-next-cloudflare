
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isAuthenticated } from "@/modules/auth/utils/auth-utils";

// Removing explicit edge runtime to allow for potentially Node.js compatible auth libraries
// export const runtime = "edge";

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ key: string[] }> }
) {
    try {
        // Enterprise Security: Verify Authentication
        const authed = await isAuthenticated();
        if (!authed) {
             return new NextResponse("Unauthorized", { status: 401 });
        }

        const params = await props.params;
        const objectKey = params.key.join("/");
        
        if (!objectKey) {
            return new NextResponse("Key required", { status: 400 });
        }

        const { env } = await getCloudflareContext();

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

    } catch (e: any) {
        console.error("Asset Proxy Error:", e);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
