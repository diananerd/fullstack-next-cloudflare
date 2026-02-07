import { Artwork } from "../schemas/artwork.schema";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useArtworkActions } from "../hooks/use-artwork-actions";
import { ArtworkStatusBadge } from "./artwork-status-badge";
import { ArtworkActionButtons } from "./artwork-action-buttons";
import { ImageIcon, X, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

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
    const { isProtected, isProcessing } = actions;

    const [imageError, setImageError] = useState(false);

    useEffect(() => {
        if (isOpen) setImageError(false);
    }, [isOpen, artwork.url, artwork.protectedUrl]);

    const displayUrl =
        isProtected && artwork.protectedUrl
            ? artwork.protectedUrl
            : artwork.url;
    const fileSize = artwork.size
        ? (artwork.size / 1024 / 1024).toFixed(2) + " MB"
        : "";

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                showCloseButton={false}
                className="fixed top-0 left-0 !max-w-none w-screen h-[100dvh] p-0 m-0 translate-x-0 translate-y-0 rounded-none border-none bg-black flex flex-col items-center justify-center overflow-hidden focus:outline-none ring-0 outline-none data-[state=open]:slide-in-from-bottom-0"
            >
                <DialogTitle className="sr-only">{artwork.title}</DialogTitle>

                <div className="relative w-full h-full flex items-center justify-center">
                    {displayUrl && !imageError ? (
                        <img
                            src={displayUrl}
                            alt={artwork.title}
                            className={cn(
                                "max-w-full max-h-full w-full h-full object-contain",
                                isProcessing && "blur-sm opacity-80",
                            )}
                            onError={() => setImageError(true)}
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
                            {/* Top-Left: Status & Filename */}
                            <div className="flex items-center gap-2 pointer-events-auto">
                                <ArtworkStatusBadge
                                    status={artwork.protectionStatus}
                                />
                                <div
                                    className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded text-sm text-white max-w-[50vw] truncate select-none"
                                    title={artwork.title}
                                >
                                    {artwork.title}
                                </div>
                            </div>

                            {/* Top-Right: Close Button */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="bg-black/60 backdrop-blur-md text-white hover:text-white hover:bg-black/80 rounded-full h-10 w-10 pointer-events-auto"
                                onClick={onClose}
                            >
                                <X className="h-6 w-6" />
                            </Button>
                        </div>

                        {/* Bottom Row */}
                        <div className="flex justify-between items-end w-full">
                            {/* Bottom-Left: File Size */}
                            <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded text-xs font-medium text-white/90 pointer-events-auto select-none">
                                {fileSize}
                            </div>

                            {/* Bottom-Right: Actions */}
                            <ArtworkActionButtons actions={actions} />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
