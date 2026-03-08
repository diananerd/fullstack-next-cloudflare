"use client";

import {
    Eye,
    EyeOff,
    FolderOpen,
    Lock,
    MoreVertical,
    Pencil,
    Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CollectionWorkspaceItem } from "@/modules/artworks/models/workspace-item.model";

interface CollectionCardProps {
    item: CollectionWorkspaceItem;
    basePath?: string;
    onRename?: (id: string) => void;
    onDelete?: (id: string) => void;
    onVisibilityChange?: (id: string, visibility: "public" | "private") => void;
}

export function CollectionCard({
    item,
    basePath = "/artworks",
    onRename,
    onDelete,
    onVisibilityChange,
}: CollectionCardProps) {
    const router = useRouter();
    const [menuOpen, setMenuOpen] = useState(false);
    const hasMenu = onRename || onDelete || onVisibilityChange;

    const itemCountLabel =
        item.itemCount === 0
            ? "Empty"
            : `${item.itemCount} item${item.itemCount !== 1 ? "s" : ""}`;

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: card navigation
        // biome-ignore lint/a11y/useKeyWithClickEvents: card navigation
        <div
            className="group relative @container overflow-hidden rounded-lg w-full bg-gray-100/50 hover:bg-gray-100 transition-colors cursor-pointer"
            onClick={() => router.push(`${basePath}?collectionId=${item.id}`)}
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
                        <FolderOpen className="h-10 w-10 text-zinc-600 group-hover:text-zinc-500 transition-colors" />
                    </div>
                )}

                {/* Gradient scrim for bottom text readability */}
                <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

                {/* Overlay */}
                <div className="absolute inset-0 p-3 flex flex-col pointer-events-none">
                    {/* Top row: lock + kebab */}
                    <div className="flex items-start w-full gap-2">
                        {item.visibility === "private" && (
                            <Lock className="h-3 w-3 text-white/70 mt-0.5 drop-shadow" />
                        )}

                        {hasMenu && (
                            <div className="ml-auto pointer-events-auto relative">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuOpen((v) => !v);
                                    }}
                                    className="h-6 w-6 flex items-center justify-center rounded-md bg-black/30 text-white/80 hover:bg-black/50 transition-colors opacity-0 group-hover:opacity-100"
                                    aria-label="Collection options"
                                >
                                    <MoreVertical className="h-3.5 w-3.5" />
                                </button>

                                {menuOpen && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-10"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setMenuOpen(false);
                                            }}
                                        />
                                        <div className="absolute top-full right-0 mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-lg py-1 z-20 text-sm">
                                            {onRename && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setMenuOpen(false);
                                                        onRename(item.id);
                                                    }}
                                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50 text-left"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                    Rename
                                                </button>
                                            )}
                                            {onVisibilityChange && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setMenuOpen(false);
                                                        onVisibilityChange(
                                                            item.id,
                                                            item.visibility ===
                                                                "private"
                                                                ? "public"
                                                                : "private",
                                                        );
                                                    }}
                                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50 text-left"
                                                >
                                                    {item.visibility ===
                                                    "private" ? (
                                                        <Eye className="h-3.5 w-3.5" />
                                                    ) : (
                                                        <EyeOff className="h-3.5 w-3.5" />
                                                    )}
                                                    {item.visibility ===
                                                    "private"
                                                        ? "Make public"
                                                        : "Make private"}
                                                </button>
                                            )}
                                            {onDelete && (
                                                <>
                                                    <div className="border-t border-gray-100 my-1" />
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setMenuOpen(false);
                                                            onDelete(item.id);
                                                        }}
                                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 text-left"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                        Delete
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </>
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
