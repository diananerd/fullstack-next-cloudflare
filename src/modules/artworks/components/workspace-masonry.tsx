"use client";

import { MasonryGrid } from "@/components/ui/masonry-grid";
import type { Artwork } from "@/modules/artworks/schemas/artwork.schema";
import type { CollectionWorkspaceItem } from "@/modules/artworks/models/workspace-item.model";
import { CollectionCard } from "@/modules/social/components/collection-card";
import { ArtworkCard } from "./artwork-card";

type WorkspaceItem =
    | { kind: "artwork"; data: Artwork }
    | { kind: "collection"; data: CollectionWorkspaceItem };

interface WorkspaceMasonryProps {
    artworks: Artwork[];
    collections: CollectionWorkspaceItem[];
}

export function WorkspaceMasonry({
    artworks,
    collections,
}: WorkspaceMasonryProps) {
    // Folders first, then artworks — like a file system
    const items: WorkspaceItem[] = [
        ...collections.map(
            (c): WorkspaceItem => ({ kind: "collection", data: c }),
        ),
        ...artworks.map((a): WorkspaceItem => ({ kind: "artwork", data: a })),
    ];

    return (
        <MasonryGrid
            items={items}
            keyExtractor={(item) =>
                item.kind === "artwork"
                    ? `a-${item.data.id}`
                    : `c-${item.data.id}`
            }
            render={(item) =>
                item.kind === "collection" ? (
                    <CollectionCard item={item.data} />
                ) : (
                    <ArtworkCard artwork={item.data} />
                )
            }
        />
    );
}
