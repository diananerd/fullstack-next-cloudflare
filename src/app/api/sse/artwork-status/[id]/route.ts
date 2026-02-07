import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/modules/auth/utils/auth-utils";
import { ProtectionStatus } from "@/modules/artworks/models/artwork.enum";

// Use edge runtime for better streaming support on Cloudflare
// export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const artworkId = parseInt(id);
    console.log(`[SSE] New connection request for artwork ${artworkId}`);

    // 1. Auth check
    const session = await getSession();
    if (!session?.user) {
        console.log(`[SSE] Unauthorized access attempt for artwork ${artworkId}`);
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const encoder = new TextEncoder();

    // 2. Pre-fetch DB instance to avoid ALS context issues in callbacks
    // We get the DB *before* creating the stream to ensure we have the context
    let db: any;
    try {
        db = await getDb();
    } catch (e) {
        console.error("[SSE] Failed to get DB instance:", e);
        return new NextResponse('Internal Server Error', { status: 500 });
    }

    const stream = new ReadableStream({
        async start(controller) {
            let interval: NodeJS.Timeout;
            
            // Send initial ping to confirm connection
            controller.enqueue(encoder.encode(": ping\n\n"));

            const checkStatus = async () => {
                try {
                    const artwork = await db.query.artworks.findFirst({
                        where: eq(artworks.id, artworkId),
                        columns: {
                            protectionStatus: true,
                            userId: true
                        }
                    });

                    if (!artwork) {
                        console.log(`[SSE] Artwork ${artworkId} not found`);
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "ERROR", error: "Not found" })}\n\n`));
                        clearInterval(interval);
                        controller.close();
                        return;
                    }

                    if (artwork.userId !== session.user.id) {
                         console.log(`[SSE] User mismatch for artwork ${artworkId}`);
                         controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "ERROR", error: "Unauthorized" })}\n\n`));
                         clearInterval(interval);
                         controller.close();
                         return;
                    }

                    // Send current status
                    // console.log(`[SSE] Sending status for ${artworkId}: ${artwork.protectionStatus}`);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: artwork.protectionStatus })}\n\n`));

                    // If final state, close stream
                    if (artwork.protectionStatus === ProtectionStatus.PROTECTED || 
                        artwork.protectionStatus === ProtectionStatus.FAILED ||
                        artwork.protectionStatus === ProtectionStatus.CANCELED) {
                        console.log(`[SSE] Final state reached for ${artworkId}: ${artwork.protectionStatus}`);
                        clearInterval(interval);
                        controller.close();
                    }
                } catch (error) {
                    console.error("[SSE] Polling Error", error);
                    // attempt to keep alive
                }
            };

            // Check immediately
            await checkStatus();

            // Poll every 1 second (faster updates)
            interval = setInterval(checkStatus, 1000);

            // Cleanup when client disconnects
            request.signal.addEventListener('abort', () => {
                console.log(`[SSE] Client disconnected for artwork ${artworkId}`);
                clearInterval(interval);
            });
        }
    });

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable buffering for Nginx/Proxies
        },
    });
}
