import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { deleteFromR2, uploadToR2 } from "@/lib/r2";
import { ProtectionStatus } from "@/modules/artworks/models/artwork.enum";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";

export const maxDuration = 60; // Allow function to run longer (up to 60s for hobby/pro)

// This simulates the External GPU Provider receiving a request
export async function POST(req: NextRequest) {
    let artworkId: number | undefined;
    try {
        const body = (await req.json()) as {
            artworkId: number;
            fileUrl: string;
        };
        artworkId = body.artworkId;
        const { fileUrl } = body;

        if (!artworkId || !fileUrl) {
            return NextResponse.json(
                { error: "Missing parameters" },
                { status: 400 },
            );
        }

        const db = await getDb();

        // 1. Set Status to PROCESSING
        try {
            await db
                .update(artworks)
                .set({
                    protectionStatus: ProtectionStatus.PROCESSING,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(artworks.id, artworkId));
        } catch (dbErr) {
            console.error("[MockGPU] Failed to set processing status", dbErr);
            // Non-critical if we can't show "Processing", but good to know.
            // If DB is down, likely next steps will fail too.
        }

        console.log(
            `[MockGPU] Starting protection for ${artworkId} (${fileUrl})`,
        );

        // Simulate processing delay (e.g., 5-10 seconds)
        // In a real scenario, this endpoint might return immediately "Job Accepted" and process async.
        // But for this mock, we'll just wait a bit and then "call the webhook" (execute logic).

        // We can't easily wait 10s and keep the connection open in all serverless environments without timeouts,
        // but for a mock, let's just do it.
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // FETCH the raw image bytes
        const response = await fetch(fileUrl);
        if (!response.ok) {
            throw new Error(
                `Failed to fetch raw image: ${response.statusText}`,
            );
        }
        const blob = await response.blob();

        // Extract filename/hash from URL to maintain naming convention
        // Expecting URL like: .../raw/HASH.ext
        const urlPath = new URL(fileUrl).pathname;
        const originalFileName =
            urlPath.split("/").pop() || `artwork_${artworkId}.png`;
        const fileHashName =
            originalFileName.substring(0, originalFileName.lastIndexOf(".")) ||
            "unknown_hash";

        const file = new File([blob], originalFileName, { type: blob.type });

        // UPLOAD the "Protected" version to R2
        // We use the SAME HASH (or derived) but in 'protected' folder.
        // Logic: protected/HASH.ext
        const uploadResult = await uploadToR2(file, "protected", fileHashName);

        // Use the returned key/url from uploadToR2 if available, or construct it?
        // uploadToR2 returns { success, url, key }
        if (!uploadResult.success || !uploadResult.key || !uploadResult.url) {
            throw new Error("Failed to upload protected image to R2");
        }

        console.log(
            `[MockGPU] Uploaded protected version to ${uploadResult.key}`,
        );

        // CALL Webhook (Simulated by updating DB directly here for simplicity,
        // OR actually calling our own webhook endpoint if we want to be purist).
        // Let's update DB directly to avoid self-calling hell in local dev (localhost port issues etc).

        // CHECK FOR CANCELLATION RACE CONDITION
        const currentArtwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
        });

        if (currentArtwork?.protectionStatus === ProtectionStatus.CANCELED) {
            console.log(
                `[MockGPU] Job for ${artworkId} was canceled. Cleaning up.`,
            );
            if (uploadResult.key) await deleteFromR2(uploadResult.key);
            return NextResponse.json({
                success: false,
                message: "Job canceled",
            });
        }

        await db
            .update(artworks)
            .set({
                protectionStatus: ProtectionStatus.PROTECTED,
                protectedR2Key: uploadResult.key,
                protectedUrl: uploadResult.url,
                updatedAt: new Date().toISOString(),
            })
            .where(eq(artworks.id, artworkId));

        console.log(`[MockGPU] Job complete for ${artworkId}`);

        return NextResponse.json({
            success: true,
            message: "Protection applied (mock)",
        });
    } catch (error: unknown) {
        console.error("[MockGPU] Error:", error);

        // Attempt to set status to FAILED in DB if we have an ID
        if (artworkId) {
            try {
                const db = await getDb();
                await db
                    .update(artworks)
                    .set({
                        protectionStatus: ProtectionStatus.FAILED,
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(artworks.id, artworkId));
            } catch (dbErr) {
                console.error("[MockGPU] Failed to set FAILED status", dbErr);
            }
        }

        // biome-ignore lint/suspicious/noExplicitAny: Error handling
        return NextResponse.json(
            { error: (error as any).message },
            { status: 500 },
        );
    }
}
