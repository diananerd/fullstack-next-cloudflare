import { ImageIcon, ImageOff, X, Layers, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useArtworkActions } from "../hooks/use-artwork-actions";
import type { Artwork } from "../schemas/artwork.schema";
// import { getArtworkDisplayUrl } from "../utils/artwork-url"; // Replaced by internal logic
import { ArtworkActionButtons } from "./artwork-action-buttons";
import { ArtworkStatusBadge } from "./artwork-status-badge";
import { ProtectionStatus } from "../models/artwork.enum";

interface ArtworkFullViewProps {
    artwork: Artwork;
    isOpen: boolean;
    onClose: () => void;
}

export function ArtworkFullView({
    artwork,
    isOpen,
    onClose,
}: ArtworkFullViewProps) {
    const actions = useArtworkActions(artwork);
    const { isProtected, isProcessing, optimisticStatus } = actions;

    // View state: 'protected' | 'original'
    // Default to 'protected' if available, else 'original'
    const [viewMode, setViewMode] = useState<"protected" | "original">(
        "protected",
    );

    const [imageError, setImageError] = useState(false);

    // Track if protected is genuinely broken (404) to disable the option
    const [protectedBroken, setProtectedBroken] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setImageError(false);
            setProtectedBroken(false);
            // Reset to protected view on open if applicable
            setViewMode("protected");
        }
    }, [isOpen]);

    // Helpers to resolve URLs
    const getProtectedUrl = () => {
        if (artwork.r2Key) {
            try {
                // Support both legacy {hash}/original vs new {userId}/{hash}/original structures
                // We strip the filename and replace it with protected.png
                const lastSlashIndex = artwork.r2Key.lastIndexOf("/");
                if (lastSlashIndex !== -1) {
                    const prefix = artwork.r2Key.substring(0, lastSlashIndex);
                    return `/api/assets/${prefix}/protected.png`;
                }
                // Fallback: if no slash, it's just a file (unlikely), but let's just use the parts
                const parts = artwork.r2Key.split("/");
                if (parts.length > 0) {
                     // Legacy fallback - keeping original logic as last resort but it was buggy for deep paths
                     // The safer bet is the prefix logic above.
                     // If no slash, assume it's just a filename?
                     return ""; 
                }
            } catch (e) {}
        }
        return "";
    };

    const protectedUrl = getProtectedUrl();
    const originalUrl = artwork.url;

    // Determine what to show
    const displayUrl =
        viewMode === "protected" &&
        protectedUrl &&
        optimisticStatus === ProtectionStatus.DONE &&
        !protectedBroken
            ? protectedUrl
            : originalUrl;

    const fileSize = artwork.size
        ? `${(artwork.size / 1024 / 1024).toFixed(2)} MB`
        : "";

    const hasProtectedVersion =
        !!protectedUrl &&
        optimisticStatus === ProtectionStatus.DONE &&
        !protectedBroken;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                showCloseButton={false}
                className="fixed top-0 left-0 !max-w-none w-screen h-[100dvh] p-0 m-0 translate-x-0 translate-y-0 rounded-none border-none bg-black flex flex-col items-center justify-center overflow-hidden focus:outline-none ring-0 outline-none data-[state=open]:slide-in-from-bottom-0"
            >
                <DialogTitle className="sr-only">{artwork.title}</DialogTitle>

                <div className="relative w-full h-full flex items-center justify-center">
                    {displayUrl && !imageError ? (
                        // biome-ignore lint/performance/noImgElement: External/Dynamic URL
                        <img
                            src={displayUrl}
                            alt={artwork.title}
                            className={cn(
                                "max-w-full max-h-full w-full h-full object-contain",
                                // isProcessing && "opacity-80", // No blur or opacity needed
                            )}
                            onError={() => {
                                // If we are attempting to show protected, and it fails, fallback.
                                if (
                                    viewMode === "protected" &&
                                    displayUrl === protectedUrl
                                ) {
                                    setProtectedBroken(true);
                                    setViewMode("original");
                                } else {
                                    setImageError(true);
                                }
                            }}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-gray-500 gap-4">
                            {imageError ? (
                                <>
                                    <ImageOff className="h-24 w-24 text-gray-600" />
                                    <div className="text-center">
                                        <p className="text-lg font-medium text-gray-400">
                                            Image not found
                                        </p>
                                        <p className="text-sm text-gray-600">
                                            The requested image could not be
                                            loaded.
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <ImageIcon className="h-24 w-24 mb-4" />
                                    <p>No image available</p>
                                </>
                            )}
                        </div>
                    )}

                    {/* HUD Overlay */}
                    <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none">
                        {/* Top Row */}
                        <div className="flex justify-between items-center w-full">
                            {/* Top-Left: Status & File Size */}
                            <div className="flex items-center gap-2 pointer-events-auto">
                                <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded text-xs font-medium text-white/90 select-none">
                                    {fileSize}
                                </div>
                                <ArtworkStatusBadge status={optimisticStatus} />
                            </div>

                            {/* Top-Right: Action Group (Protect, Download, Delete, Close) */}
                            <ArtworkActionButtons actions={actions} hideCancel>
                                {/* Separator / Close Button appended to group */}
                                <div className="w-px h-4 bg-white/20 mx-1" />
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="h-7 w-7 bg-black/60 hover:bg-white/20 text-white rounded-full border-0 shadow-sm"
                                    onClick={onClose}
                                    title="Close"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </ArtworkActionButtons>
                        </div>

                        {/* Bottom Row */}
                        <div className="flex justify-center items-end w-full relative">
                            {/* Bottom-Center: Original/Protected Toggle */}
                            {hasProtectedVersion && (
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-8 flex gap-1 pointer-events-auto bg-black/60 backdrop-blur-xl p-1 rounded-lg border border-white/10">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        title="View Protected"
                                        className={cn(
                                            "h-9 w-9 rounded-md transition-all",
                                            viewMode === "protected"
                                                ? "bg-indigo-500 text-white shadow-glow"
                                                : "text-white/60 hover:text-white hover:bg-white/10",
                                        )}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setViewMode("protected");
                                        }}
                                    >
                                        <ShieldCheck className="h-5 w-5" />
                                        <span className="sr-only">
                                            Protected
                                        </span>
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        title="View Original"
                                        className={cn(
                                            "h-9 w-9 rounded-md transition-all",
                                            viewMode === "original"
                                                ? "bg-white text-black shadow-lg"
                                                : "text-white/60 hover:text-white hover:bg-white/10",
                                        )}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setViewMode("original");
                                        }}
                                    >
                                        <ImageIcon className="h-5 w-5" />
                                        <span className="sr-only">
                                            Original
                                        </span>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
