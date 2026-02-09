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

    const variants = (artwork.metadata as any)?.variants || [];
    
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
        if (variant.url) return variant.url;
        // Construct from key if needed (assuming same R2 domain proxy logic)
        try {
            // New Structure: {hash}/filename.ext
            // We need to know the endpoint structure. 
            // ArtworkUrl util does `/api/assets/${hash}/mist-v2.png`
            // If we stored the full relative key like `hash/mist.png`:
             const parts = variant.key.split("/");
             if (parts.length > 0) {
                 const hash = parts[0];
                 const filename = variant.key.replace(`${hash}/`, '');
                 return `/api/assets/${hash}/${filename}`;
             }
        } catch(e) { return "" }
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
                            {/* Top-Left: Status */}
                            <div className="flex items-center gap-2 pointer-events-auto">
                                <ArtworkStatusBadge status={optimisticStatus} />
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

                            {/* Bottom-Right: Actions */}
                            <ArtworkActionButtons
                                actions={actions}
                                hideCancel
                            />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
