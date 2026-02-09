import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";

// export const runtime = "edge"; // Removed to fix import issues

export async function GET(
    _req: NextRequest,
    props: { params: Promise<{ id: string }> },
) {
    try {
        const params = await props.params;
        const { id } = params;

        // console.log(`[StatusAPI] Request for ${id}`);
        const artworkId = parseInt(id, 10);

        if (Number.isNaN(artworkId)) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        const db = await getDb();

        // 1. Get Artwork
        const artwork = await db.query.artworks.findFirst({
            where: eq(artworks.id, artworkId),
        });

        if (!artwork) {
            // console.log(`[StatusAPI] Artwork ${id} not found`);
            return NextResponse.json(
                { error: "Artwork not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({
            status: artwork.protectionStatus,
        });
    } catch (error) {
        console.error("[StatusAPI] Critical Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
