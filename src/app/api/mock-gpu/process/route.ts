import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { ProtectionStatus } from "@/modules/artworks/models/artwork.enum";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { sendToQueue } from "@/lib/queue";

export const maxDuration = 60; 

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
            throw new Error("Database error");
        }

        console.log(
            `[MockGPU] Queuing protection for ${artworkId} (${fileUrl})`,
        );

        // 2. Send to Queue
        await sendToQueue({
            type: "PROCESS_ARTWORK",
            payload: {
                artworkId,
                fileUrl
            }
        });

        return NextResponse.json({
            success: true,
            message: "Protection job queued",
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
