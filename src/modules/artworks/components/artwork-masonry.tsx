"use client";

import { Artwork } from "@/modules/artworks/schemas/artwork.schema";
import { MasonryGrid } from "@/components/ui/masonry-grid";
import { ArtworkCard } from "./artwork-card";

interface ArtworkMasonryProps {
    artworks: Artwork[];
}

export function ArtworkMasonry({ artworks }: ArtworkMasonryProps) {
    return (
        <MasonryGrid
            items={artworks}
            keyExtractor={(artwork) => artwork.id}
            render={(artwork) => <ArtworkCard key={artwork.id} artwork={artwork} />}
        />
    );
}
