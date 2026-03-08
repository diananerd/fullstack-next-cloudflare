"use client";

import { useEffect, useRef, useState } from "react";
import { MasonryGrid } from "@/components/ui/masonry-grid";
import { PublicArtworkCard } from "@/modules/artworks/components/public-artwork-card";
import { CollectionCard } from "@/modules/social/components/collection-card";
import type { WorkspaceQuery } from "@/modules/artworks/models/workspace-item.model";
import {
    getDiscoverWorkspaceItemsAction,
    type DiscoverWorkspaceItem,
} from "@/modules/artworks/actions/get-discover-workspace-items.action";

interface DiscoverWorkspaceGridProps {
    initialItems: DiscoverWorkspaceItem[];
    initialHasMore: boolean;
    query: WorkspaceQuery;
    isLoggedIn?: boolean;
}

export function DiscoverWorkspaceGrid({
    initialItems,
    initialHasMore,
    query,
    isLoggedIn = false,
}: DiscoverWorkspaceGridProps) {
    const [items, setItems] = useState(initialItems);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [isLoading, setIsLoading] = useState(false);
    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setItems(initialItems);
        setHasMore(initialHasMore);
    }, [initialItems, initialHasMore]);

    const loadMore = async () => {
        if (isLoading || !hasMore) return;
        setIsLoading(true);
        try {
            const result = await getDiscoverWorkspaceItemsAction({
                ...query,
                offset: items.length,
            });
            setItems((prev) => [...prev, ...result.items]);
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
                if (entries[0].isIntersecting) loadMore();
            },
            { threshold: 0.1 },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    });

    if (items.length === 0) return null;

    return (
        <div>
            <MasonryGrid
                items={items}
                keyExtractor={(item) => `${item.kind[0]}-${item.id}`}
                render={(item) => {
                    if (item.kind === "artwork") {
                        return (
                            <PublicArtworkCard
                                item={item}
                                isLoggedIn={isLoggedIn}
                                ownerSlug={item.ownerSlug}
                                ownerName={item.ownerName}
                            />
                        );
                    }
                    if (item.kind === "collection") {
                        const basePath = item.ownerSlug
                            ? `/@${item.ownerSlug}`
                            : "/discover";
                        return (
                            <CollectionCard
                                item={item}
                                basePath={basePath}
                            />
                        );
                    }
                    return null;
                }}
            />
            <div ref={sentinelRef} className="h-10" />
            {isLoading && (
                <div className="flex justify-center py-6">
                    <div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                </div>
            )}
        </div>
    );
}
