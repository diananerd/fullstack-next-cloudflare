"use client";

import { ImageIcon, ImageOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import type { Artwork } from "@/modules/artworks/schemas/artwork.schema";
import { useArtworkStatus } from "../hooks/use-artwork-status";
import { useArtworkActions } from "../hooks/use-artwork-actions";
import { ArtworkActionButtons } from "./artwork-action-buttons";
import { ArtworkFullView } from "./artwork-full-view";
import { ArtworkStatusBadge } from "./artwork-status-badge";

interface ArtworkCardProps {
    artwork: Artwork;
}

export function ArtworkCard({ artwork }: ArtworkCardProps) {
    // Live status updates via SSE (replaces polling)
    const liveStatus = useArtworkStatus(artwork.id, artwork.protectionStatus);
    
    // Memoize the live artwork object to prevent unnecessary re-renders of hooks
    const liveArtwork = {
        ...artwork,
        protectionStatus: liveStatus
    };

    const actions = useArtworkActions(liveArtwork);
    const { isProcessing, isProtected, optimisticStatus } = actions;
    
    const router = useRouter();
    const [_, startTransition] = useTransition();
    const [showFullView, setShowFullView] = useState(false);
    const [imageError, setImageError] = useState(false);

    // Reset error when URL changes
    useEffect(() => {
        setImageError(false);
    }, [artwork.url, artwork.protectedUrl]);

    // Note: Polling logic removed in favor of SSE in useArtworkStatus

    const displayUrl =
        isProtected && artwork.protectedUrl
            ? artwork.protectedUrl
            : artwork.url;

    return (
        <>
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: Card click interaction */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: Card click interaction */}
            <div
                className="group relative overflow-hidden rounded-lg w-full bg-gray-100/50 hover:bg-gray-100 transition-colors cursor-pointer"
                onClick={() => setShowFullView(true)}
            >
                {/* Image (Main Content) */}
                <div className="relative w-full">
                    {displayUrl && !imageError ? (
                        <img
                            src={displayUrl}
                            alt={artwork.title}
                            className={cn(
                                "w-full h-auto min-h-[12rem] object-cover transition-all duration-500 rounded-lg block",
                                isProcessing
                                    ? "blur-sm scale-105 opacity-80"
                                    : "group-hover:opacity-95",
                            )}
                            loading="lazy"
                            decoding="async"
                            onError={() => setImageError(true)}
                        />
                    ) : (
                        <div className="w-full aspect-square min-h-[12rem] bg-zinc-900 rounded-lg flex flex-col items-center justify-center border border-zinc-800 text-zinc-500 gap-2 p-4 text-center">
                            {imageError ? (
                                <>
                                    <ImageOff className="h-8 w-8" />
                                    <span className="text-xs">
                                        Image not found
                                    </span>
                                </>
                            ) : (
                                <ImageIcon className="h-10 w-10 text-zinc-600" />
                            )}
                        </div>
                    )}

                    {/* Overlays */}
                    <div className="absolute inset-0 p-3 flex flex-col justify-between pointer-events-none">
                        {/* Top Row: Empty now, but structure kept for potential future use */}
                        <div className="flex justify-end w-full">
                            {/* Empty or top-right items */}
                        </div>

                        {/* Bottom Row */}
                        <div className="flex justify-between items-end">
                            {/* Bottom-Left: Status (Optimistic) */}
                            <ArtworkStatusBadge status={optimisticStatus} />

                            {/* Bottom-Right: Actions */}
                            <ArtworkActionButtons actions={actions} />
                        </div>
                    </div>
                </div>
            </div>

            <ArtworkFullView
                artwork={artwork}
                isOpen={showFullView}
                onClose={() => setShowFullView(false)}
            />
        </>
    );
}
