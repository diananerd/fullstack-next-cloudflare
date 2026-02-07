"use client";

import { MasonryGrid } from "@/components/ui/masonry-grid";
import type { Artwork } from "@/modules/artworks/schemas/artwork.schema";
import { ArtworkCard } from "./artwork-card";

interface ArtworkMasonryProps {
    artworks: Artwork[];
}

export function ArtworkMasonry({ artworks }: ArtworkMasonryProps) {
    return (
        <MasonryGrid
            items={artworks}
            keyExtractor={(artwork) => artwork.id}
            render={(artwork) => (
                <ArtworkCard key={artwork.id} artwork={artwork} />
            )}
        />
    );
}
