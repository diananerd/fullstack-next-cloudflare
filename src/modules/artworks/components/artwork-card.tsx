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

    const variants = (liveArtwork.metadata as any)?.variants || [];
    // Display original mostly, but maybe show icons for variants.
    // User requirement: "in the card shows the original as value".
    const displayUrl = liveArtwork.url; // Always Original

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
                    <div className="absolute inset-0 p-3 flex flex-col pointer-events-none">
                        {/* Top Row: Status & Actions */}
                        <div className="flex items-start w-full gap-2">
                            <div className="mr-auto">
                                <ArtworkStatusBadge status={optimisticStatus} />
                            </div>
                            <ArtworkActionButtons actions={actions} />
                        </div>
                        
                        {/* Bottom Row: Variant Icons */}
                        <div className="mt-auto flex gap-1 items-end">
                            {variants.map((v: any) => (
                                <div 
                                    key={v.id || v.createdAt}
                                    className="bg-black/60 backdrop-blur-md p-1 rounded-sm border border-white/20 text-white/80"
                                    title={`Processed with ${v.method || 'Unknown'}`}
                                >
                                   {/* Simple Icon based on method logic could go here. For now just a dot or letter */}
                                   <span className="text-[10px] font-bold uppercase leading-none block px-1">
                                    {v.method ? v.method[0] : "V"}
                                   </span>
                                </div>
                            ))}
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
