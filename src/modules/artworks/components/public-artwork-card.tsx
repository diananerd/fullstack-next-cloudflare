"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { ArtworkWorkspaceItem } from "@/modules/artworks/models/workspace-item.model";

interface PublicArtworkCardProps {
    item: ArtworkWorkspaceItem;
}

/**
 * Read-only artwork card for public profile pages.
 * Click opens a full-view lightbox — no action buttons.
 */
export function PublicArtworkCard({ item }: PublicArtworkCardProps) {
    const [open, setOpen] = useState(false);

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
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-4xl p-0 bg-zinc-950 border-zinc-800 overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="absolute top-3 right-3 z-10 h-8 w-8 flex items-center justify-center rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    <div className="flex flex-col">
                        {/* biome-ignore lint/performance/noImgElement: full view */}
                        <img
                            src={item.url}
                            alt={item.title}
                            className="w-full h-auto max-h-[80vh] object-contain"
                            onContextMenu={(e) => e.preventDefault()}
                            onDragStart={(e) => e.preventDefault()}
                        />
                        {item.title && (
                            <div className="px-4 py-3 border-t border-zinc-800">
                                <p className="text-sm font-medium text-white/90 truncate">
                                    {item.title}
                                </p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
