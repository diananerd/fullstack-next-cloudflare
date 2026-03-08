"use client";

import {
    FolderOpen,
    LayoutGrid,
    Lock,
    LockOpen,
    Pencil,
    Share2,
    Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import type { CollectionWorkspaceItem } from "@/modules/artworks/models/workspace-item.model";

interface CollectionCardProps {
    item: CollectionWorkspaceItem;
    basePath?: string;
    /** Profile base path for share URL, e.g. "/@username". Falls back to basePath. */
    profilePath?: string;
    isFolder?: boolean;
    onRename?: (id: string) => void;
    onDelete?: (id: string) => void;
    onVisibilityChange?: (id: string, visibility: "public" | "private") => void;
}

export function CollectionCard({
    item,
    basePath = "/artworks",
    profilePath,
    isFolder = false,
    onRename,
    onDelete,
    onVisibilityChange,
}: CollectionCardProps) {
    const router = useRouter();

    const itemCountLabel =
        item.itemCount === 0
            ? "Empty"
            : `${item.itemCount} item${item.itemCount !== 1 ? "s" : ""}`;

    const handleShare = (e: React.MouseEvent) => {
        e.stopPropagation();
        const base = profilePath ?? basePath;
        const url = `${window.location.origin}${base}?collectionId=${item.id}`;
        navigator.clipboard.writeText(url).then(
            () => toast.success("Link copied"),
            () => toast.error("Could not copy link"),
        );
    };

    const btn =
        "h-7 w-7 flex items-center justify-center rounded-full bg-black/30 text-white/80 hover:bg-black/50 transition-colors";

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: card navigation
        // biome-ignore lint/a11y/useKeyWithClickEvents: card navigation
        <div
            className="group relative @container overflow-hidden rounded-lg w-full bg-gray-100/50 hover:bg-gray-100 transition-colors cursor-pointer"
            onClick={() => router.push(`${basePath}?collectionId=${item.id}`)}
        >
            <div className="relative w-full">
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

                <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

                <div className="absolute inset-0 p-3 flex flex-col pointer-events-none">
                    {/* Top row: action buttons */}
                    {/* biome-ignore lint/a11y/noStaticElementInteractions: action container */}
                    {/* biome-ignore lint/a11y/useKeyWithClickEvents: action container */}
                    <div
                        className="flex items-center justify-end gap-1 pointer-events-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {onRename && (
                            <button
                                type="button"
                                title="Rename"
                                onClick={(e) => { e.stopPropagation(); onRename(item.id); }}
                                className={btn}
                            >
                                <Pencil className="h-4 w-4" />
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
                                className={btn}
                            >
                                {item.visibility === "private" ? (
                                    <LockOpen className="h-4 w-4" />
                                ) : (
                                    <Lock className="h-4 w-4" />
                                )}
                            </button>
                        )}
                        <button
                            type="button"
                            title="Share"
                            onClick={handleShare}
                            className={btn}
                        >
                            <Share2 className="h-4 w-4" />
                        </button>
                        {onDelete && (
                            <button
                                type="button"
                                title="Delete"
                                onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                                className="h-7 w-7 flex items-center justify-center rounded-full bg-black/30 text-red-400 hover:bg-red-500/40 hover:text-red-300 transition-colors"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
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
