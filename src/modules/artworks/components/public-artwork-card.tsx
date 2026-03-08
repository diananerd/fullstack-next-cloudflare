"use client";

import type { ArtworkWorkspaceItem } from "@/modules/artworks/models/workspace-item.model";

interface PublicArtworkCardProps {
    item: ArtworkWorkspaceItem;
}

/**
 * Read-only artwork card for public profile pages.
 * Same visual language as ArtworkCard but no actions, no hooks, no status badge.
 */
export function PublicArtworkCard({ item }: PublicArtworkCardProps) {
    return (
        <div className="group relative overflow-hidden rounded-lg w-full bg-gray-100/50">
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
    );
}
