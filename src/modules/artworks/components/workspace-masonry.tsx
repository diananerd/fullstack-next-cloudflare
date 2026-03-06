"use client";

import { MasonryGrid } from "@/components/ui/masonry-grid";
import type { Artwork } from "@/modules/artworks/schemas/artwork.schema";
import { CollectionCard } from "@/modules/social/components/collection-card";
import type { Collection } from "@/modules/social/schemas/collection.schema";
import { ArtworkCard } from "./artwork-card";

type WorkspaceItem =
    | { kind: "artwork"; data: Artwork }
    | { kind: "collection"; data: Collection; role: string };

interface WorkspaceMasonryProps {
    artworks: Artwork[];
    collections: { collection: Collection; role: string }[];
    parentId?: string;
}

export function WorkspaceMasonry({
    artworks,
    collections,
    parentId,
}: WorkspaceMasonryProps) {
    // Folders first, then artworks — like a file system
    const items: WorkspaceItem[] = [
        ...collections.map(
            ({ collection, role }): WorkspaceItem => ({
                kind: "collection",
                data: collection,
                role,
            }),
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
                    <CollectionCard
                        collection={item.data}
                        role={item.role}
                        parentId={parentId}
                    />
                ) : (
                    <ArtworkCard artwork={item.data} />
                )
            }
        />
    );
}
