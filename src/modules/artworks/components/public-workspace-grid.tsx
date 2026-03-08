"use client";

import { useEffect, useRef, useState } from "react";
import { MasonryGrid } from "@/components/ui/masonry-grid";
import { PublicArtworkCard } from "@/modules/artworks/components/public-artwork-card";
import { CollectionCard } from "@/modules/social/components/collection-card";
import type {
    WorkspaceItem,
    WorkspaceQuery,
} from "@/modules/artworks/models/workspace-item.model";
import { getPublicWorkspaceItemsAction } from "@/modules/profiles/actions/get-public-workspace-items.action";

interface PublicWorkspaceGridProps {
    ownerUserId: string;
    initialItems: WorkspaceItem[];
    initialHasMore: boolean;
    query: WorkspaceQuery;
    basePath: string;
    isLoggedIn?: boolean;
}

export function PublicWorkspaceGrid({
    ownerUserId,
    initialItems,
    initialHasMore,
    query,
    basePath,
    isLoggedIn = false,
}: PublicWorkspaceGridProps) {
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
            const result = await getPublicWorkspaceItemsAction(ownerUserId, {
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
                keyExtractor={(item) =>
                    item.kind === "artwork" ? `a-${item.id}` : `c-${item.id}`
                }
                render={(item) => {
                    if (item.kind === "artwork") {
                        return (
                            <PublicArtworkCard
                                item={item}
                                isLoggedIn={isLoggedIn}
                            />
                        );
                    }
                    if (item.kind === "collection") {
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
