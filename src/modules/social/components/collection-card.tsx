"use client";

import {
    Eye,
    EyeOff,
    FolderOpen,
    LayoutGrid,
    Lock,
    Pencil,
    Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { CollectionWorkspaceItem } from "@/modules/artworks/models/workspace-item.model";

interface CollectionCardProps {
    item: CollectionWorkspaceItem;
    basePath?: string;
    /** When true, renders a folder icon instead of a board icon as fallback. */
    isFolder?: boolean;
    onRename?: (id: string) => void;
    onDelete?: (id: string) => void;
    onVisibilityChange?: (id: string, visibility: "public" | "private") => void;
}

export function CollectionCard({
    item,
    basePath = "/artworks",
    isFolder = false,
    onRename,
    onDelete,
    onVisibilityChange,
}: CollectionCardProps) {
    const router = useRouter();
    const hasActions = onRename || onDelete || onVisibilityChange;

    const itemCountLabel =
        item.itemCount === 0
            ? "Empty"
            : `${item.itemCount} item${item.itemCount !== 1 ? "s" : ""}`;

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: card navigation
        // biome-ignore lint/a11y/useKeyWithClickEvents: card navigation
        <div
            className="group relative @container overflow-hidden rounded-lg w-full bg-gray-100/50 hover:bg-gray-100 transition-colors cursor-pointer"
            onClick={() =>
                router.push(`${basePath}?collectionId=${item.id}`)
            }
        >
            <div className="relative w-full">
                {/* Cover image or icon placeholder */}
                {item.coverUrl ? (
                    <img
                        src={item.coverUrl}
                        alt={item.title}
                        className="w-full h-auto min-h-[8rem] object-cover rounded-lg block"
                        loading="lazy"
                        decoding="async"
                    />
                ) : (
                    <div className="w-full aspect-[4/3] min-h-[8rem] bg-zinc-900 rounded-lg flex items-center justify-center">
                        {isFolder ? (
                            <FolderOpen className="h-10 w-10 text-zinc-600 group-hover:text-zinc-500 transition-colors" />
                        ) : (
                            <LayoutGrid className="h-10 w-10 text-zinc-600 group-hover:text-zinc-500 transition-colors" />
                        )}
                    </div>
                )}

                {/* Gradient scrim for bottom text readability */}
                <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

                {/* Overlay */}
                <div className="absolute inset-0 p-3 flex flex-col pointer-events-none">
                    {/* Top row: lock + action buttons */}
                    <div className="flex items-start w-full gap-1.5">
                        {item.visibility === "private" && (
                            <Lock className="h-3 w-3 text-white/70 mt-1 drop-shadow flex-shrink-0" />
                        )}

                        {hasActions && (
                            <div className="ml-auto flex items-center gap-1 pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity">
                                {onRename && (
                                    <button
                                        type="button"
                                        title="Rename"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRename(item.id);
                                        }}
                                        className="h-6 w-6 flex items-center justify-center rounded-md bg-black/30 text-white/80 hover:bg-black/50 transition-colors"
                                    >
                                        <Pencil className="h-3 w-3" />
                                    </button>
                                )}
                                {onVisibilityChange && (
                                    <button
                                        type="button"
                                        title={item.visibility === "private" ? "Make public" : "Make private"}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onVisibilityChange(
                                                item.id,
                                                item.visibility === "private" ? "public" : "private",
                                            );
                                        }}
                                        className="h-6 w-6 flex items-center justify-center rounded-md bg-black/30 text-white/80 hover:bg-black/50 transition-colors"
                                    >
                                        {item.visibility === "private" ? (
                                            <Eye className="h-3 w-3" />
                                        ) : (
                                            <EyeOff className="h-3 w-3" />
                                        )}
                                    </button>
                                )}
                                {onDelete && (
                                    <button
                                        type="button"
                                        title="Delete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete(item.id);
                                        }}
                                        className="h-6 w-6 flex items-center justify-center rounded-md bg-black/30 text-red-400 hover:bg-red-500/40 hover:text-red-300 transition-colors"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Bottom: title + count */}
                    <div className="mt-auto">
                        <p className="text-xs font-semibold text-white drop-shadow truncate leading-tight">
                            {item.title}
                        </p>
                        <p className="text-xs text-white/60 drop-shadow mt-0.5">
                            {itemCountLabel}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
