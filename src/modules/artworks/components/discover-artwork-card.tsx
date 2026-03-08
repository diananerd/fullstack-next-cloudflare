"use client";

import { Download, MoreVertical } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { ArtworkFullView } from "@/modules/artworks/components/artwork-full-view";
import type { DiscoverItem } from "@/modules/artworks/actions/get-discover-workspace-items.action";
import type { Artwork } from "@/modules/artworks/schemas/artwork.schema";

interface DiscoverArtworkCardProps {
    item: DiscoverItem;
}

export function DiscoverArtworkCard({ item }: DiscoverArtworkCardProps) {
    const [open, setOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    const artwork: Artwork = {
        id: item.id,
        title: item.title,
        description: null,
        userId: "",
        createdBy: "",
        workspaceId: null,
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
        kind: "artwork",
    } as Artwork;

    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setMenuOpen(false);
        if (!item.url) return;
        try {
            toast.loading("Downloading...", { id: "dl" });
            const res = await fetch(item.url);
            if (!res.ok) throw new Error("Failed");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${item.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success("Download started", { id: "dl" });
        } catch {
            toast.error("Download failed", { id: "dl" });
        }
    };

    return (
        <>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: card click */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: card click */}
            <div
                className="group relative overflow-hidden rounded-lg w-full bg-gray-100/50 hover:bg-gray-100 transition-colors cursor-pointer"
                onClick={() => setOpen(true)}
            >
                {/* biome-ignore lint/performance/noImgElement: artwork thumbnail */}
                <img
                    src={item.url}
                    alt={item.title}
                    className="w-full h-auto min-h-[12rem] object-cover rounded-lg block group-hover:opacity-95 transition-opacity duration-200"
                    loading="lazy"
                    decoding="async"
                    onContextMenu={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                />

                {/* Gradient scrim */}
                <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

                <div className="absolute inset-0 p-3 flex flex-col pointer-events-none">
                    {/* Top-right: kebab menu — only shown when there are actions available */}
                    {item.allowDownload && (
                        <div className="flex justify-end">
                            {/* biome-ignore lint/a11y/noStaticElementInteractions: menu */}
                            {/* biome-ignore lint/a11y/useKeyWithClickEvents: menu */}
                            <div
                                className="pointer-events-auto relative"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuOpen((v) => !v);
                                    }}
                                    className="h-6 w-6 flex items-center justify-center rounded-md bg-black/30 text-white/80 hover:bg-black/50 transition-colors opacity-0 group-hover:opacity-100"
                                    aria-label="Options"
                                >
                                    <MoreVertical className="h-3.5 w-3.5" />
                                </button>

                                {menuOpen && (
                                    <>
                                        {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop */}
                                        {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop */}
                                        <div
                                            className="fixed inset-0 z-10"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setMenuOpen(false);
                                            }}
                                        />
                                        {item.allowDownload && (
                                            <div className="absolute top-full right-0 mt-1 w-36 rounded-lg border border-gray-200 bg-white shadow-lg py-1 z-20 text-sm">
                                                <button
                                                    type="button"
                                                    onClick={handleDownload}
                                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50 text-left"
                                                >
                                                    <Download className="h-3.5 w-3.5" />
                                                    Download
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Bottom-left: author link */}
                    {item.ownerSlug && (
                        <div className="mt-auto pointer-events-auto">
                            <Link
                                href={`/@${item.ownerSlug}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs font-medium text-white/80 hover:text-white drop-shadow transition-colors truncate block"
                            >
                                {item.ownerName ?? `@${item.ownerSlug}`}
                            </Link>
                        </div>
                    )}
                </div>
            </div>

            <ArtworkFullView
                artwork={artwork}
                isOpen={open}
                onClose={() => setOpen(false)}
                readOnly
                authorName={item.ownerName}
                authorSlug={item.ownerSlug}
            />
        </>
    );
}
