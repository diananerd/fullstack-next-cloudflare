"use client";

import { useEffect, useRef, useState } from "react";
import { MasonryGrid } from "@/components/ui/masonry-grid";
import { DiscoverArtworkCard } from "@/modules/artworks/components/discover-artwork-card";
import {
    getDiscoverItemsAction,
    type DiscoverItem,
    type DiscoverQuery,
} from "@/modules/artworks/actions/get-discover-items.action";

interface DiscoverGridProps {
    initialItems: DiscoverItem[];
    initialHasMore: boolean;
    query: DiscoverQuery;
}

export function DiscoverGrid({
    initialItems,
    initialHasMore,
    query,
}: DiscoverGridProps) {
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
            const result = await getDiscoverItemsAction({
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
                keyExtractor={(item) => `a-${item.id}`}
                render={(item) => <DiscoverArtworkCard item={item} />}
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
