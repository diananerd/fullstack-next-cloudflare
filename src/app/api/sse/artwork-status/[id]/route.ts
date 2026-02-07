import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { eq } from "drizzle-orm";
import { verifySessionEdge } from "../../auth-edge";
import { ProtectionStatus } from "@/modules/artworks/models/artwork.enum";

export const runtime = 'edge';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const artworkId = parseInt(id);

    // 1. Auth & Setup
    const session = await verifySessionEdge(request);
    if (!session?.user) {
        return new Response('Unauthorized', { status: 401 });
    }

    // 2. TransformStream Pattern (Standard Web API)
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // 3. Status Loop
    // We run this async function to push data into the stream.
    // The stream returning in the Response keeps the connection open.
    const runStream = async () => {
        let db: any;
        try {
            db = await getDb();
        } catch (e) {
            console.error("[SSE] DB Init failed", e);
            await writer.close();
            return;
        }

        // Send initial connection confirmation (comment)
        try {
            await writer.write(encoder.encode(": connected\n\n"));
        } catch (e) {
            // Client likely disconnected immediately
            return;
        }

        const startTime = Date.now();
        // Limit connection to ~29 seconds to avoid Cloudflare hard timeouts.
        // The client (EventSource) will automatically reconnect.
        const MAX_DURATION = 29000; 

        while (true) {
            try {
                // Check disconnect
                if (request.signal.aborted) {
                    break;
                }
                
                // Check duration limit
                if (Date.now() - startTime > MAX_DURATION) {
                     // Graceful close for rotation
                    break;
                }

                const artwork = await db.query.artworks.findFirst({
                    where: eq(artworks.id, artworkId),
                    columns: {
                        protectionStatus: true,
                        userId: true
                    }
                });

                if (!artwork || artwork.userId !== session.user.id) {
                    // Send error event and close
                    const msg = JSON.stringify({ status: "ERROR", error: "Not found or Unauthorized" });
                    await writer.write(encoder.encode(`data: ${msg}\n\n`));
                    break;
                }

                // Send Status
                const msg = JSON.stringify({ status: artwork.protectionStatus });
                await writer.write(encoder.encode(`data: ${msg}\n\n`));

                // Terminal states
                if (artwork.protectionStatus === ProtectionStatus.PROTECTED || 
                    artwork.protectionStatus === ProtectionStatus.FAILED ||
                    artwork.protectionStatus === ProtectionStatus.CANCELED) {
                    break;
                }

                // Wait 1s
                await new Promise(r => setTimeout(r, 1000));

            } catch (err) {
                console.error("[SSE] Loop error", err);
                break;
            }
        }
        
        try {
            await writer.close();
        } catch(e) {
            // Ignore close errors
        }
    };

    // Start the loop (do not await, let it run in background of the stream)
    runStream();

    // 4. Return Response (Standard, not NextResponse)
    return new Response(readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
