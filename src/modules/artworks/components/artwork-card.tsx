"use client";

import { ImageIcon, ImageOff } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import type { Artwork } from "@/modules/artworks/schemas/artwork.schema";
import { useArtworkActions } from "../hooks/use-artwork-actions";
import { useArtworkStatus } from "../hooks/use-artwork-status";
import { getArtworkDisplayUrl } from "../utils/artwork-url";
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
        protectionStatus: liveStatus,
    };

    const actions = useArtworkActions(liveArtwork);
    const { isProcessing, isProtected, optimisticStatus } = actions;

    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const [imageError, setImageError] = useState(false);

    // Deep Linking: Sync URL with Modal State
    // Use Hash from r2Key as identifier
    const artworkHash = artwork.r2Key.split("/")[0];
    const showFullView = searchParams.get("artwork") === artworkHash;

    const handleOpen = () => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("artwork", artworkHash);
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const handleClose = () => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("artwork");
        const newQuery = params.toString();
        const newPath = newQuery ? `${pathname}?${newQuery}` : pathname;
        router.push(newPath, { scroll: false });
    };

    // Reset error when URL changes
    useEffect(() => {
        setImageError(false);
    }, []);

    // Note: Polling logic removed in favor of SSE in useArtworkStatus

    // Display protected if available, otherwise original
    // IMPORTANT: Assuming DONE + r2Key means protected exists is naive.
    // We should fallback on 404 onError.
    const defaultUrl = getArtworkDisplayUrl(liveArtwork);
    const [displayUrl, setDisplayUrl] = useState(defaultUrl);

    useEffect(() => {
        setDisplayUrl(defaultUrl);
        setImageError(false);
    }, [defaultUrl]);

    return (
        <>
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: Card click interaction */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: Card click interaction */}
            <div
                className="group relative overflow-hidden rounded-lg w-full bg-gray-100/50 hover:bg-gray-100 transition-colors cursor-pointer"
                onClick={handleOpen}
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
                                    ? "scale-105 opacity-80"
                                    : "group-hover:opacity-95",
                            )}
                            loading="lazy"
                            decoding="async"
                            onError={() => {
                                // Fallback Strategy:
                                // If we are showing protected image (derived from logic) and it fails,
                                // fallback to the original URL.
                                if (displayUrl !== liveArtwork.url) {
                                    setDisplayUrl(liveArtwork.url);
                                } else {
                                    setImageError(true);
                                }
                            }}
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
                    <div className="absolute inset-0 p-3 flex flex-col pointer-events-none">
                        {/* Top Row: Status & Actions */}
                        <div className="flex items-start w-full gap-2">
                            <div className="mr-auto">
                                <ArtworkStatusBadge status={optimisticStatus} />
                            </div>
                            <ArtworkActionButtons actions={actions} />
                        </div>
                    </div>
                </div>
            </div>

            <ArtworkFullView
                artwork={liveArtwork}
                isOpen={showFullView}
                onClose={handleClose}
            />
        </>
    );
}
