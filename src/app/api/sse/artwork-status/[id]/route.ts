import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { eq } from "drizzle-orm";
// import { getSession } from "@/modules/auth/utils/auth-utils"; // Removed to avoid Node.js deps in Edge
import { verifySessionEdge } from "../../auth-edge";
import { ProtectionStatus } from "@/modules/artworks/models/artwork.enum";

// Use edge runtime for better streaming support on Cloudflare
export const runtime = 'edge';
// export const dynamic = 'force-dynamic'; // runtime=edge implies dynamic usually

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const artworkId = parseInt(id);
    console.log(`[SSE] New connection request for artwork ${artworkId}`);

    // 1. Auth check (Edge compatible)
    const session = await verifySessionEdge(request);
    
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
            // Send initial ping to confirm connection
            try {
                controller.enqueue(encoder.encode(": ping\n\n"));
            } catch (e) {
                 // Stream closed immediately
                 return;
            }

            try {
                // Loop until client disconnects or we initiate close
                while (!request.signal.aborted) {
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
                            break;
                        }

                        if (artwork.userId !== session.user.id) {
                            console.log(`[SSE] User mismatch for artwork ${artworkId}`);
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "ERROR", error: "Unauthorized" })}\n\n`));
                            break;
                        }

                        // Send status
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: artwork.protectionStatus })}\n\n`));

                        // Check terminal state
                        if (artwork.protectionStatus === ProtectionStatus.PROTECTED || 
                            artwork.protectionStatus === ProtectionStatus.FAILED ||
                            artwork.protectionStatus === ProtectionStatus.CANCELED) {
                            console.log(`[SSE] Final state reached for ${artworkId}: ${artwork.protectionStatus}`);
                            break;
                        }
                    } catch (err) {
                        console.error("[SSE] Error during polling cycle:", err);
                        // Optional: break; 
                    }

                    // Sleep for 1 second before next poll
                    // This keeps the execution context alive within the stream's start method
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error("[SSE] Stream error:", error);
            } finally {
                console.log(`[SSE] Closing stream for artwork ${artworkId}`);
                try {
                    controller.close(); 
                } catch(e) { /* ignore if already closed */ }
            }
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
