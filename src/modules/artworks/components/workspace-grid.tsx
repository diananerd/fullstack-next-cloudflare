"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { MasonryGrid } from "@/components/ui/masonry-grid";
import { ArtworkCard } from "@/modules/artworks/components/artwork-card";
import { CollectionRenameDialog } from "@/modules/artworks/components/collection-rename-dialog";
import type {
    CollectionWorkspaceItem,
    FolderWorkspaceItem,
    WorkspaceItem,
    WorkspaceQuery,
} from "@/modules/artworks/models/workspace-item.model";
import { getWorkspaceItemsAction } from "@/modules/artworks/actions/get-workspace-items.action";
import {
    deleteCollectionAction,
    updateCollectionAction,
} from "@/modules/artworks/actions/collection.action";
import { moveWorkspaceItemAction } from "@/modules/artworks/actions/move-item.action";
import { CollectionCard } from "@/modules/social/components/collection-card";
import type { Artwork } from "@/modules/artworks/schemas/artwork.schema";

type DragPayload = { kind: "artwork" | "folder" | "collection"; id: string };

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
    const [renamingItem, setRenamingItem] = useState<{
        id: string;
        title: string;
    } | null>(null);
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
        targetContainerId: string,
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

        // Can't drop a container onto itself
        if (payload.id === targetContainerId) return;

        const result = await moveWorkspaceItemAction(
            payload.id,
            targetContainerId,
        );
        if (!result.success) {
            toast.error("Failed to move item");
            return;
        }

        router.refresh();
    };

    const handleRename = (id: string) => {
        const item = items.find(
            (i) =>
                i.id === id && (i.kind === "folder" || i.kind === "collection"),
        );
        if (item && item.kind !== "artwork") {
            setRenamingItem({ id: item.id, title: item.title });
        }
    };

    const handleDelete = async (id: string) => {
        const item = items.find((i) => i.id === id);
        const label = item?.kind === "folder" ? "folder" : "collection";
        if (
            !window.confirm(
                `Delete this ${label}? Items inside will move to your root workspace.`,
            )
        )
            return;
        const result = await deleteCollectionAction(id);
        if (result.success) {
            toast.success(
                `${label.charAt(0).toUpperCase() + label.slice(1)} deleted.`,
            );
            router.refresh();
        } else {
            toast.error(result.error ?? `Failed to delete ${label}.`);
        }
    };

    const handleVisibilityChange = async (
        id: string,
        visibility: "public" | "private",
    ) => {
        const result = await updateCollectionAction(id, { visibility });
        if (result.success) {
            router.refresh();
        } else {
            toast.error("Failed to update visibility.");
        }
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
                    if (item.kind === "folder" || item.kind === "collection") {
                        // Folders are always private — no visibility toggle
                        const isFolder = item.kind === "folder";

                        // CollectionCard expects CollectionWorkspaceItem; adapt folder
                        const cardItem: CollectionWorkspaceItem = isFolder
                            ? {
                                  kind: "collection",
                                  id: item.id,
                                  title: item.title,
                                  createdAt: item.createdAt,
                                  updatedAt: item.updatedAt,
                                  visibility: "private",
                                  itemCount: (item as FolderWorkspaceItem)
                                      .itemCount,
                                  role: "owner",
                                  coverUrl: null,
                              }
                            : (item as CollectionWorkspaceItem);

                        return (
                            // biome-ignore lint/a11y/noStaticElementInteractions: drop target
                            <div
                                draggable
                                onDragStart={(e) =>
                                    handleDragStart(e, {
                                        kind: item.kind,
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
                                    item={cardItem}
                                    isFolder={isFolder}
                                    onRename={handleRename}
                                    onDelete={handleDelete}
                                    // Folders are always private — no visibility toggle
                                    onVisibilityChange={
                                        isFolder
                                            ? undefined
                                            : handleVisibilityChange
                                    }
                                />
                            </div>
                        );
                    }

                    // artwork
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
                        allowDownload: item.allowDownload,
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
                            <ArtworkCard
                                artwork={artwork}
                                currentCollectionId={query.collectionId ?? null}
                            />
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

            {renamingItem && (
                <CollectionRenameDialog
                    open={true}
                    onOpenChange={(open) => {
                        if (!open) setRenamingItem(null);
                    }}
                    collectionId={renamingItem.id}
                    currentName={renamingItem.title}
                />
            )}
        </div>
    );
}
