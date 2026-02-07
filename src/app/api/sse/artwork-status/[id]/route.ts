import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/modules/auth/utils/auth-utils";
import { ProtectionStatus } from "@/modules/artworks/models/artwork.enum";

// Use edge runtime for better streaming support on Cloudflare
export const runtime = 'edge';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const artworkId = parseInt(id);

    // 1. Auth check
    const session = await getSession();
    if (!session?.user) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            let interval: NodeJS.Timeout;
            let db: any;
            
            try {
                // Initialize DB once (if possible in this scope)
                 db = await getDb();
            } catch (e) {
                console.error("DB Init failed", e);
                controller.close();
                return;
            }

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
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "ERROR", error: "Not found" })}\n\n`));
                        clearInterval(interval);
                        controller.close();
                        return;
                    }

                    if (artwork.userId !== session.user.id) {
                         controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "ERROR", error: "Unauthorized" })}\n\n`));
                         clearInterval(interval);
                         controller.close();
                         return;
                    }

                    // Send current status
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: artwork.protectionStatus })}\n\n`));

                    // If final state, close stream
                    if (artwork.protectionStatus === ProtectionStatus.PROTECTED || 
                        artwork.protectionStatus === ProtectionStatus.FAILED ||
                        artwork.protectionStatus === ProtectionStatus.CANCELED) {
                        clearInterval(interval);
                        controller.close();
                    }
                } catch (error) {
                    console.error("SSE Polling Error", error);
                    // Don't close immediately on transient error, maybe?
                }
            };

            // Check immediately
            await checkStatus();

            // Poll every 2 seconds
            interval = setInterval(checkStatus, 2000);

            // Cleanup when client disconnects
            request.signal.addEventListener('abort', () => {
                clearInterval(interval);
            });
        }
    });

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
