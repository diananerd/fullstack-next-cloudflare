"use client";

import { ImageIcon, ImageOff } from "lucide-react";
import { Artwork } from "@/modules/artworks/schemas/artwork.schema";
import { cn } from "@/lib/utils";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useArtworkActions } from "../hooks/use-artwork-actions";
import { ArtworkActionButtons } from "./artwork-action-buttons";
import { ArtworkStatusBadge } from "./artwork-status-badge";
import { ArtworkFullView } from "./artwork-full-view";

interface ArtworkCardProps {
    artwork: Artwork;
}

export function ArtworkCard({ artwork }: ArtworkCardProps) {
    const actions = useArtworkActions(artwork);
    const { isProcessing, isProtected } = actions;

    const router = useRouter();
    const [_, startTransition] = useTransition();
    const [showFullView, setShowFullView] = useState(false);
    const [imageError, setImageError] = useState(false);

    // Reset error when URL changes
    useEffect(() => {
        setImageError(false);
    }, [artwork.url, artwork.protectedUrl]);

    // Auto-refresh poll if processing
    useEffect(() => {
        if (!isProcessing) return;

        const interval = setInterval(() => {
            startTransition(() => {
                router.refresh();
            });
        }, 5000); // Poll every 5 seconds

        return () => clearInterval(interval);
    }, [isProcessing, router]);

    const displayUrl =
        isProtected && artwork.protectedUrl
            ? artwork.protectedUrl
            : artwork.url;
    const fileSize = artwork.size
        ? (artwork.size / 1024 / 1024).toFixed(2) + " MB"
        : "";

    return (
        <>
            <div
                className="group relative break-inside-avoid mb-4 overflow-hidden rounded-lg inline-block w-full align-top bg-gray-100/50 hover:bg-gray-100 transition-colors cursor-pointer"
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
                            onError={() => setImageError(true)}
                        />
                    ) : (
                        <div className="w-full aspect-square min-h-[12rem] bg-gray-50 rounded-lg flex flex-col items-center justify-center border border-gray-200 text-gray-400 gap-2 p-4 text-center">
                            {imageError ? (
                                <>
                                    <ImageOff className="h-8 w-8" />
                                    <span className="text-xs">
                                        Image not found
                                    </span>
                                </>
                            ) : (
                                <ImageIcon className="h-10 w-10 text-gray-300" />
                            )}
                        </div>
                    )}

                    {/* Overlays */}
                    <div className="absolute inset-0 p-3 flex flex-col justify-between pointer-events-none bg-gradient-to-b from-black/40 via-transparent to-black/60">
                        {/* Top Row */}
                        <div className="flex justify-between items-start">
                            {/* Top-Left: Filename */}
                            <div
                                className="bg-black/60 backdrop-blur-md px-2 py-1 rounded text-xs text-white max-w-[65%] truncate pointer-events-auto select-none"
                                title={artwork.title}
                            >
                                {artwork.title}
                            </div>

                            {/* Top-Right: Status */}
                            <ArtworkStatusBadge
                                status={artwork.protectionStatus}
                            />
                        </div>

                        {/* Bottom Row */}
                        <div className="flex justify-between items-end">
                            {/* Bottom-Left: File Size */}
                            <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] font-medium text-white/90 pointer-events-auto">
                                {fileSize}
                            </div>

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
