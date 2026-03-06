import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PipelineService } from "@/modules/artworks/services/pipeline.service";
import { ProtectionMethod } from "@/modules/artworks/models/artwork.enum";

export const runtime = "edge";

export async function PUT(
    req: NextRequest,
    props: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await props.params;
        const url = new URL(req.url);
        const token = url.searchParams.get("token");

        if (!token)
            return NextResponse.json(
                { error: "Missing token" },
                { status: 401 },
            );

        const db = await getDb();
        const artwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, parseInt(id)),
        });

        if (!artwork)
            return NextResponse.json(
                { error: "Artwork not found" },
                { status: 404 },
            );

        const meta = artwork.metadata as any;
        if (!meta || meta.uploadToken !== token) {
            return NextResponse.json(
                { error: "Invalid token" },
                { status: 403 },
            );
        }

        // Stream to R2
        const { env } = await getCloudflareContext();
        // Assuming env.R2_BUCKET is bound as 'R2_BUCKET' or similar in Workers
        const bucket =
            (env as any).R2_BUCKET ||
            (env as any).BUCKET ||
            (env as any).drimit_shield_bucket;

        if (!bucket) {
            console.error("R2 Bucket Binding Missing");
            return NextResponse.json(
                { error: "Server Configuration Error" },
                { status: 500 },
            );
        }

        if (!req.body) {
            return NextResponse.json({ error: "No body" }, { status: 400 });
        }

        // R2 PUT
        await bucket.put(artwork.r2Key, req.body);

        // Start Pipeline
        // Map config string to pipeline
        // Use stored config from metadata if available
        const userConfig =
            meta.config && typeof meta.config === "object" ? meta.config : {};

        const pipelineConfig = [
            {
                method: ProtectionMethod.SHIELD,
                config: {
                    // Merge defaults with user provided config
                    intensity: userConfig.intensity || "High",
                    watermark_text: userConfig.watermark_text || "DRIMIT",
                    ...userConfig,
                },
            },
        ];

        await PipelineService.startPipeline(
            artwork.id,
            artwork.userId,
            pipelineConfig,
        );

        return NextResponse.json({ status: "uploaded_and_queued" });
    } catch (e) {
        console.error("[API Asset Upload]", e);
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
