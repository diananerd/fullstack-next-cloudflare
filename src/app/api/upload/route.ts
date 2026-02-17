import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { ProtectionStatus } from "@/modules/artworks/models/artwork.enum";

export const runtime = "edge";

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as any;
        const { filename, content_type, size, config } = body || {};

        if (!filename || !content_type) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 },
            );
        }

        const db = await getDb();
        
        // --- Authentication Check ---
        const authHeader = req.headers.get("Authorization");
        const token = authHeader?.replace("Bearer ", "");
        const apiKey = process.env.DRIMIT_API_KEY || "drimit-dev-key"; // Fallback for dev

        if (!token || token !== apiKey) {
             return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Use crypto.randomUUID for unique ID
        const userId = "api_user_" + crypto.randomUUID().split("-")[0];
        const fileKey = `uploads/${userId}/${crypto.randomUUID()}-${filename}`;

        const now = new Date().toISOString();
        const uploadToken = crypto.randomUUID();

        // Note: Using `any` cast to bypass potential strict typing issues with missing optional fields in schema
        // in this specific file context where we lack full type defs for insert
        const [artwork] = await db
            .insert(artworks)
            .values({
                userId: userId, // Ensure DB schema matches camelCase
                title: filename, // Map filename to title
                r2Key: fileKey,
                status: "active",
                protectionStatus: ProtectionStatus.UPLOADING,
                fileType: content_type,
                fileSize: size ? Number(size) : 0,
                errorMessage: null,
                url: `https://assets.drimit.ai/${fileKey}`,
                metadata: {
                    source: "api",
                    config: config || "default",
                    contentType: content_type,
                    uploadToken: uploadToken,
                },
                createdAt: now,
                updatedAt: now,
            } as any)
            .returning();

        // Generate a URL to our own API that handles the PUT
        const origin = new URL(req.url).origin;
        const uploadUrl = `${origin}/api/assets/upload/${artwork.id}?token=${uploadToken}`;

        return NextResponse.json({
            upload_url: uploadUrl,
            job_id: String(artwork.id),
            artwork_id: String(artwork.id),
        });
    } catch (e) {
        console.error("[API Upload]", e);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
