"use client";

import { useState } from "react";
import { ArtworkFullView } from "@/modules/artworks/components/artwork-full-view";
import type { ArtworkWorkspaceItem } from "@/modules/artworks/models/workspace-item.model";
import type { Artwork } from "@/modules/artworks/schemas/artwork.schema";

interface PublicArtworkCardProps {
    item: ArtworkWorkspaceItem;
}

export function PublicArtworkCard({ item }: PublicArtworkCardProps) {
    const [open, setOpen] = useState(false);

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

            <ArtworkFullView
                artwork={artwork}
                isOpen={open}
                onClose={() => setOpen(false)}
                readOnly
            />
        </>
    );
}
