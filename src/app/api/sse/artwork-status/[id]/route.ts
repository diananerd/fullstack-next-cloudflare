import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { eq } from "drizzle-orm";
import { verifySessionEdge } from "../../auth-edge";

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

    try {
        const db = await getDb();
        const artwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
            columns: {
                protectionStatus: true,
                userId: true
            }
        });

        if (!artwork || artwork.userId !== session.user.id) {
            return NextResponse.json(
                { status: "ERROR", error: "Not found or Unauthorized" },
                { status: 404 }
            );
        }

        return NextResponse.json({ status: artwork.protectionStatus });

    } catch (e) {
        console.error("DB Error", e);
        return NextResponse.json({ status: "ERROR" }, { status: 500 });
    }
}
