"use client";

import { useEffect, useRef, useState } from "react";
import { MasonryGrid } from "@/components/ui/masonry-grid";
import { ArtworkCard } from "@/modules/artworks/components/artwork-card";
import type {
    ArtworkWorkspaceItem,
    CollectionWorkspaceItem,
    WorkspaceQuery,
} from "@/modules/artworks/models/workspace-item.model";
import { getWorkspaceItemsAction } from "@/modules/artworks/actions/get-workspace-items.action";
import { CollectionCard } from "@/modules/social/components/collection-card";
import type { Artwork } from "@/modules/artworks/schemas/artwork.schema";
import type { Collection } from "@/modules/social/schemas/collection.schema";

type DisplayItem =
    | { kind: "artwork"; data: ArtworkWorkspaceItem }
    | { kind: "collection"; data: CollectionWorkspaceItem };

interface WorkspaceGridProps {
    collections: CollectionWorkspaceItem[];
    initialArtworks: ArtworkWorkspaceItem[];
    initialHasMore: boolean;
    query: WorkspaceQuery;
}

export function WorkspaceGrid({
    collections,
    initialArtworks,
    initialHasMore,
    query,
}: WorkspaceGridProps) {
    const [artworks, setArtworks] = useState(initialArtworks);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [isLoading, setIsLoading] = useState(false);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Reset when query changes (sort/filter/collection)
    useEffect(() => {
        setArtworks(initialArtworks);
        setHasMore(initialHasMore);
    }, [initialArtworks, initialHasMore]);

    const loadMore = async () => {
        if (isLoading || !hasMore) return;
        setIsLoading(true);
        try {
            const result = await getWorkspaceItemsAction({
                ...query,
                offset: artworks.length,
            });
            setArtworks((prev) => [...prev, ...result.artworks]);
            setHasMore(result.hasMore);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    loadMore();
                }
            },
            { threshold: 0.1 },
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    });

    const items: DisplayItem[] = [
        ...collections.map((c): DisplayItem => ({ kind: "collection", data: c })),
        ...artworks.map((a): DisplayItem => ({ kind: "artwork", data: a })),
    ];

    if (items.length === 0) return null;

    return (
        <div>
            <MasonryGrid
                items={items}
                keyExtractor={(item) =>
                    item.kind === "artwork"
                        ? `a-${item.data.id}`
                        : `c-${item.data.id}`
                }
                render={(item) => {
                    if (item.kind === "collection") {
                        // CollectionCard expects Collection shape — map from WorkspaceItem
                        const col = {
                            id: item.data.id,
                            title: item.data.title,
                            createdAt: item.data.createdAt,
                            updatedAt: item.data.updatedAt,
                            visibility: item.data.visibility,
                            itemCount: item.data.itemCount,
                            createdByUserId: "",
                            description: null,
                            coverR2Key: null,
                            coverUrl: null,
                            membershipInheritance: "none",
                        } as Collection;
                        return (
                            <CollectionCard
                                collection={col}
                                role={item.data.role}
                            />
                        );
                    }
                    // Map ArtworkWorkspaceItem → Artwork shape for ArtworkCard
                    const artwork = {
                        id: item.data.id,
                        title: item.data.title,
                        description: null,
                        userId: "",
                        r2Key: item.data.r2Key,
                        url: item.data.url,
                        method: "shield",
                        protectionStatus: item.data.protectionStatus,
                        jobId: null,
                        metadata: null,
                        width: item.data.width,
                        height: item.data.height,
                        size: null,
                        semanticType: "digital_art",
                        visibility: item.data.visibility,
                        createdAt: item.data.createdAt,
                        updatedAt: item.data.updatedAt,
                    } as Artwork;
                    return <ArtworkCard artwork={artwork} />;
                }}
            />

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-10" />

            {isLoading && (
                <div className="flex justify-center py-6">
                    <div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                </div>
            )}
        </div>
    );
}
