"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { MasonryGrid } from "@/components/ui/masonry-grid";
import { ArtworkCard } from "@/modules/artworks/components/artwork-card";
import type {
    WorkspaceItem,
    WorkspaceQuery,
} from "@/modules/artworks/models/workspace-item.model";
import { getWorkspaceItemsAction } from "@/modules/artworks/actions/get-workspace-items.action";
import {
    moveArtworkAction,
    moveCollectionAction,
} from "@/modules/artworks/actions/move-item.action";
import { CollectionCard } from "@/modules/social/components/collection-card";
import type { Artwork } from "@/modules/artworks/schemas/artwork.schema";
import type { Collection } from "@/modules/social/schemas/collection.schema";

type DragPayload =
    | { kind: "artwork"; id: number }
    | { kind: "collection"; id: string };

interface WorkspaceGridProps {
    initialItems: WorkspaceItem[];
    initialHasMore: boolean;
    query: WorkspaceQuery;
}

export function WorkspaceGrid({
    initialItems,
    initialHasMore,
    query,
}: WorkspaceGridProps) {
    const [items, setItems] = useState(initialItems);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [isLoading, setIsLoading] = useState(false);
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        setItems(initialItems);
        setHasMore(initialHasMore);
    }, [initialItems, initialHasMore]);

    const loadMore = async () => {
        if (isLoading || !hasMore) return;
        setIsLoading(true);
        try {
            const result = await getWorkspaceItemsAction({
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

    const handleDragStart = (e: React.DragEvent, payload: DragPayload) => {
        e.dataTransfer.setData("application/json", JSON.stringify(payload));
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDrop = async (
        e: React.DragEvent,
        targetCollectionId: string,
    ) => {
        e.preventDefault();
        setDropTarget(null);

        const raw = e.dataTransfer.getData("application/json");
        if (!raw) return;

        let payload: DragPayload;
        try {
            payload = JSON.parse(raw);
        } catch {
            return;
        }

        if (payload.kind === "collection" && payload.id === targetCollectionId)
            return;

        if (payload.kind === "artwork") {
            const result = await moveArtworkAction(
                payload.id,
                query.collectionId ?? null,
                targetCollectionId,
            );
            if (!result.success) {
                toast.error("Failed to move artwork");
                return;
            }
        } else {
            const result = await moveCollectionAction(
                payload.id,
                targetCollectionId,
            );
            if (!result.success) {
                toast.error("Failed to move collection");
                return;
            }
        }

        router.refresh();
    };

    if (items.length === 0) return null;

    return (
        <div>
            <MasonryGrid
                items={items}
                keyExtractor={(item) =>
                    item.kind === "artwork" ? `a-${item.id}` : `c-${item.id}`
                }
                render={(item) => {
                    if (item.kind === "collection") {
                        const col = {
                            id: item.id,
                            title: item.title,
                            createdAt: item.createdAt,
                            updatedAt: item.updatedAt,
                            visibility: item.visibility,
                            itemCount: item.itemCount,
                            createdByUserId: "",
                            description: null,
                            coverR2Key: null,
                            coverUrl: null,
                            membershipInheritance: "none",
                        } as Collection;
                        return (
                            // biome-ignore lint/a11y/noStaticElementInteractions: drop target
                            <div
                                draggable
                                onDragStart={(e) =>
                                    handleDragStart(e, {
                                        kind: "collection",
                                        id: item.id,
                                    })
                                }
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                    setDropTarget(item.id);
                                }}
                                onDragLeave={(e) => {
                                    if (
                                        !e.currentTarget.contains(
                                            e.relatedTarget as Node,
                                        )
                                    ) {
                                        setDropTarget(null);
                                    }
                                }}
                                onDrop={(e) => handleDrop(e, item.id)}
                                className={
                                    dropTarget === item.id
                                        ? "ring-2 ring-blue-400 rounded-2xl"
                                        : undefined
                                }
                            >
                                <CollectionCard
                                    collection={col}
                                    role={item.role}
                                />
                            </div>
                        );
                    }
                    const artwork = {
                        id: item.id,
                        title: item.title,
                        description: null,
                        userId: "",
                        r2Key: item.r2Key,
                        url: item.url,
                        method: "shield",
                        protectionStatus: item.protectionStatus,
                        jobId: null,
                        metadata: null,
                        width: item.width,
                        height: item.height,
                        size: null,
                        semanticType: "digital_art",
                        visibility: item.visibility,
                        createdAt: item.createdAt,
                        updatedAt: item.updatedAt,
                    } as Artwork;
                    return (
                        <div
                            draggable
                            onDragStart={(e) =>
                                handleDragStart(e, {
                                    kind: "artwork",
                                    id: item.id,
                                })
                            }
                        >
                            <ArtworkCard artwork={artwork} />
                        </div>
                    );
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
