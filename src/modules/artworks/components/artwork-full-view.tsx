import { ImageIcon, ImageOff, X, Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useArtworkActions } from "../hooks/use-artwork-actions";
import type { Artwork } from "../schemas/artwork.schema";
// import { getArtworkDisplayUrl } from "../utils/artwork-url"; // Replaced by internal logic
import { ArtworkActionButtons } from "./artwork-action-buttons";
import { ArtworkStatusBadge } from "./artwork-status-badge";
import { ProtectionMethod } from "../models/artwork.enum";

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

    // Robustly parse variants from metadata
    const getVariants = () => {
        try {
            const meta = typeof artwork.metadata === 'string' 
                ? JSON.parse(artwork.metadata) 
                : artwork.metadata;
            return (meta as any)?.variants || [];
        } catch (e) {
            console.error("Failed to parse variants", e);
            return [];
        }
    };
    const variants = getVariants();
    
    // State for selected view: null = original, or variant object
    const [selectedVariant, setSelectedVariant] = useState<any>(null);

    const [imageError, setImageError] = useState(false);

    useEffect(() => {
        if (isOpen) {
             setImageError(false);
             setSelectedVariant(null); // Always start with original
        }
    }, [isOpen]);

    // url logic
    const getVariantUrl = (variant: any) => {
        if (!variant) return "";
        if (variant.url) return variant.url;
        
        // Fallback: Infer from parent artwork structure if we know the method
        // This handles cases where we know the folder structure but URL is missing
        if (artwork.r2Key && variant.method) {
             try {
                const parts = artwork.r2Key.split("/");
                if (parts.length > 0) {
                    const hash = parts[0]; 
                    // Use standard filenames based on method
                    let filename = "";
                    switch(variant.method) {
                        case "mist": filename = "mist-v2.png"; break;
                        case "grayscale": filename = "grayscale.png"; break;
                        case "watermark": filename = "watermark.png"; break;
                        default: filename = "protected.png";
                    }
                    if (filename) return `/api/assets/${hash}/${filename}`;
                }
             } catch(e) {}
        }
        return "";
    };

    const displayUrl = selectedVariant ? getVariantUrl(selectedVariant) : artwork.url;

    const fileSize = artwork.size
        ? `${(artwork.size / 1024 / 1024).toFixed(2)} MB`
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
                        // biome-ignore lint/performance/noImgElement: External/Dynamic URL
                        <img
                            src={displayUrl}
                            alt={artwork.title}
                            className={cn(
                                "max-w-full max-h-full w-full h-full object-contain",
                                // isProcessing && "opacity-80", // No blur or opacity needed
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
                            {/* Bottom-Center: Variant Switcher */}
                             <div className="absolute left-1/2 -translate-x-1/2 bottom-4 flex gap-2 pointer-events-auto bg-black/60 backdrop-blur-xl p-2 rounded-full border border-white/10">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                        "h-10 w-10 rounded-full hover:bg-white/20 transition-all",
                                        selectedVariant === null ? "bg-white/20 text-white" : "text-white/60"
                                    )}
                                    // onClick={() => setSelectedVariant(null)} // Not working due to strict ESLint?
                                    // Let's use clean onClick
                                    onClick={(e) => { e.stopPropagation(); setSelectedVariant(null); }}
                                    title="Original"
                                >
                                    <ImageIcon className="h-5 w-5" />
                                </Button>
                                {variants.map((v: any, idx: number) => (
                                    <Button
                                        key={idx}
                                        variant="ghost"
                                        size="icon"
                                        className={cn(
                                            "h-10 w-10 rounded-full hover:bg-white/20 transition-all",
                                            selectedVariant === v ? "bg-white/20 text-white" : "text-white/60"
                                        )}
                                        onClick={(e) => { e.stopPropagation(); setSelectedVariant(v); }}
                                        title={`Applied: ${v.method} on ${new Date(v.createdAt).toLocaleDateString()}`}
                                    >
                                         <span className="text-xs font-bold uppercase">{v.method ? v.method[0] : "V"}</span>
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
