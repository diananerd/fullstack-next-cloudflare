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
    onRename?: (id: string) => void;
    onDelete?: (id: string) => void;
    onVisibilityChange?: (id: string, visibility: "public" | "private") => void;
}

export function CollectionCard({
    item,
    onRename,
    onDelete,
    onVisibilityChange,
}: CollectionCardProps) {
    const router = useRouter();
    const [menuOpen, setMenuOpen] = useState(false);

    const hasMenu = onRename || onDelete || onVisibilityChange;

    return (
        <div className="w-full group relative">
            <button
                type="button"
                onClick={() => {
                    if (!menuOpen)
                        router.push(`/artworks?collectionId=${item.id}`);
                }}
                className="w-full text-left rounded-2xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-md transition-all duration-150 overflow-hidden"
            >
                {/* Cover area */}
                <div className="bg-gray-50 group-hover:bg-gray-100 transition-colors flex items-center justify-center aspect-[4/3] relative">
                    <FolderOpen className="h-12 w-12 text-gray-300 group-hover:text-gray-400 transition-colors" />
                    {item.visibility === "private" && (
                        <Lock className="absolute top-3 right-3 h-3.5 w-3.5 text-gray-400" />
                    )}
                </div>
                {/* Info */}
                <div className="px-3 py-2.5 pr-8">
                    <p className="text-sm font-medium text-gray-900 truncate leading-tight">
                        {item.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {item.itemCount === 0
                            ? "Empty"
                            : `${item.itemCount} item${item.itemCount !== 1 ? "s" : ""}`}
                    </p>
                </div>
            </button>

            {/* Kebab menu */}
            {hasMenu && (
                <div className="absolute bottom-2.5 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="relative">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpen((v) => !v);
                            }}
                            className="h-6 w-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            aria-label="Collection options"
                        >
                            <MoreVertical className="h-3.5 w-3.5" />
                        </button>

                        {menuOpen && (
                            <>
                                {/* Backdrop */}
                                <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setMenuOpen(false)}
                                />
                                <div className="absolute bottom-full right-0 mb-1 w-44 rounded-lg border border-gray-200 bg-white shadow-lg py-1 z-20 text-sm">
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
                                            {item.visibility === "private" ? (
                                                <Eye className="h-3.5 w-3.5" />
                                            ) : (
                                                <EyeOff className="h-3.5 w-3.5" />
                                            )}
                                            {item.visibility === "private"
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
                </div>
            )}
        </div>
    );
}
