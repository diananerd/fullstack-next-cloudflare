"use client";

import { Check, ChevronRight, Download, Eye, ImageIcon, ImageOff, Lock, MoveHorizontal, RefreshCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useArtworkActions } from "../hooks/use-artwork-actions";
import type { Artwork } from "../schemas/artwork.schema";
import { ArtworkActionButtons } from "./artwork-action-buttons";
import { ArtworkStatusBadge } from "./artwork-status-badge";

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
    
    // Parse variants safely
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
    
    // Comparison State
    const [selectedVariant, setSelectedVariant] = useState<any>(null);
    const [sliderPosition, setSliderPosition] = useState(50);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [imageError, setImageError] = useState(false);

    // Initialize state
    useEffect(() => {
        if (isOpen) {
            setImageError(false);
            setSliderPosition(50);
            // Default to latest variant if available
            if (variants && variants.length > 0) {
                setSelectedVariant(variants[variants.length - 1]);
            } else {
                setSelectedVariant(null);
            }
        }
    }, [isOpen, artwork.metadata]); // Re-run if metadata changes (e.g. completion status)

    // Comparison Logic
    const handleMove = (clientX: number) => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
            const percentage = (x / rect.width) * 100;
            setSliderPosition(percentage);
        }
    };

    const onMouseDown = () => setIsDragging(true);
    const onMouseUp = () => setIsDragging(false);
    const onMouseMove = (e: React.MouseEvent) => {
        if (isDragging) handleMove(e.clientX);
    };
    const onTouchStart = () => setIsDragging(true);
    const onTouchEnd = () => setIsDragging(false);
    const onTouchMove = (e: React.TouchEvent) => {
        if (isDragging) handleMove(e.touches[0].clientX);
    };

    // URL Construction
    const getVariantUrl = (variant: any) => {
        if (!variant) return "";
        if (variant.url) return variant.url;
        
        // Fallback: Construct from key/hash if needed
        if (artwork.r2Key && variant.method) {
             const parts = artwork.r2Key.split("/");
             if (parts.length > 0) {
                 const hash = parts[0];
                 let filename = "";
                 switch(variant.method) {
                     case "mist": filename = "mist-v2.png"; break;
                     case "grayscale": filename = "grayscale.png"; break;
                     case "watermark": filename = "watermark.png"; break;
                     default: filename = "protected.png";
                 }
                 if (filename) return `/api/assets/${hash}/${filename}`;
             }
        }
        return "";
    };

    const originalUrl = artwork.url;
    const protectedUrl = selectedVariant ? getVariantUrl(selectedVariant) : "";
    const showComparison = Boolean(protectedUrl && !imageError);

    // If protectedUrl fails, fallback to standard view?
    // For now, if imageError, we show error state.

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent 
                showCloseButton={false}
                className="max-w-[100vw] w-screen h-screen sm:max-w-none p-0 m-0 overflow-hidden bg-black/95 border-none rounded-none outline-none"
            >
                <DialogTitle className="sr-only">Artwork Comparison View</DialogTitle>
                
                <div 
                    className="relative w-full h-full flex flex-col select-none"
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                    onTouchEnd={onTouchEnd}
                >
                    {/* Header */}
                    <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                        <div className="flex items-center gap-3 pointer-events-auto">
                           <ArtworkStatusBadge status={optimisticStatus} />
                           <h2 className="text-white font-medium truncate max-w-[200px] md:max-w-md shadow-sm">
                               {artwork.title}
                           </h2>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={onClose}
                            className="text-white/80 hover:text-white hover:bg-white/10 rounded-full pointer-events-auto"
                        >
                            <X className="h-6 w-6" />
                        </Button>
                    </div>

                    {/* Main Canvas Area */}
                    <div 
                        className="flex-1 relative w-full h-full overflow-hidden bg-zinc-950 flex items-center justify-center cursor-ew-resize"
                        ref={containerRef}
                        onMouseDown={onMouseDown}
                        onMouseMove={onMouseMove}
                        onTouchStart={onTouchStart}
                        onTouchMove={onTouchMove}
                        onClick={(e) => handleMove(e.clientX)}
                    >
                         {/* Background Grid */}
                         <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
                            backgroundImage: 'radial-gradient(#333 1px, transparent 1px)',
                            backgroundSize: '20px 20px'
                        }} />

                        {/* Layer 1: Protected Vision (Right Side / Background) */}
                        {/* We use width/height full and object-contain. To make slider work with comparison,
                            images must overlap perfectly. 
                        */}
                        
                        {!imageError ? (
                            <>
                                {/* BASE IMAGE: ORIGINAL (Visible on Left logic usually requires Top Layer to be Left? 
                                    Wait. If we want Left=Original, Right=Protected. 
                                    And slider reveals from left to right?
                                    Usually slider handle is at X%. Left of X is A. Right of X is B.
                                    We can achieve this by stacking:
                                    Bottom: Protected (B)
                                    Top: Original (A). Clip-path: inset(0 0 0 0) means fully visible.
                                    If slider is at 10% (Left), we want mostly B (Protected)? 
                                    No. Slider at 0 (Left edge) -> All Protected? 
                                    Or Slider at 0 (Left edge) -> All Original?
                                    
                                    Standard: "Drag slider to reveal".
                                    Usually:
                                    Handle at Center. Left half = Original. Right half = Protected.
                                    Move handle Right -> Reveal more Original. Cover Protected.
                                    Move handle Left -> Reveal more Protected.
                                    
                                    So:
                                    Top Layer: Original.
                                    Clip Path: inset(0 calc(100% - sliderPos%) 0 0); -> Clips from Right.
                                    At 50%: Clips Right 50% -> Shows Left 50% (Original).
                                    At 100%: Clips 0 -> Shows 100% (All Original).
                                    At 0%: Clips 100% -> Shows 0% (All Protected from bottom).
                                    
                                    Correct? Yes.
                                */}
                                
                                {/* BOTTOM: Protected Image */}
                                <img
                                    src={showComparison ? protectedUrl : originalUrl}
                                    alt="Protected"
                                    className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
                                    onError={() => setImageError(true)}
                                    draggable={false}
                                />
                                {/* Label for Protected (Right side) */}
                                {showComparison && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-end gap-2 text-white/50 pointer-events-none transition-opacity duration-300"
                                         style={{ opacity: sliderPosition < 90 ? 1 : 0 }}
                                    >
                                        <Lock className="w-8 h-8" />
                                        <span className="text-xs uppercase tracking-widest font-bold">Protected</span>
                                    </div>
                                )}

                                {/* TOP: Original Image */}
                                {showComparison && (
                                    <div 
                                        className="absolute inset-0 w-full h-full overflow-hidden select-none pointer-events-none"
                                        style={{
                                            clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`
                                        }}
                                    >
                                        <img
                                            src={originalUrl}
                                            alt="Original"
                                            className="absolute inset-0 w-full h-full object-contain max-w-none"
                                            draggable={false}
                                        />
                                        
                                        {/* Label for Original (Left side) */}
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-start gap-2 text-white pointer-events-none transition-opacity duration-300"
                                             style={{ opacity: sliderPosition > 10 ? 1 : 0 }}
                                        >
                                            <Eye className="w-8 h-8 text-blue-400" />
                                            <span className="text-xs uppercase tracking-widest font-bold text-blue-400">Original</span>
                                        </div>
                                    </div>
                                )}

                                {/* Slider Handle */}
                                {showComparison && (
                                    <div 
                                        className="absolute inset-y-0 w-1 bg-white cursor-ew-resize z-20 shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-center justify-center pointer-events-none"
                                        style={{ left: `${sliderPosition}%` }}
                                    >
                                        <div className="w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-black">
                                            <MoveHorizontal className="w-4 h-4" />
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                             <div className="flex flex-col items-center gap-4 text-white/50">
                                <ImageOff className="h-16 w-16 opacity-50" />
                                <p>Failed to load image</p>
                            </div>
                        )}
                        
                         {/* Variant Switcher (Bottom Center) */}
                         {isProtected && variants.length > 0 && (
                             <div 
                                className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2"
                                onMouseDown={(e) => e.stopPropagation()}
                             >
                                 <div className="flex bg-black/60 backdrop-blur-md rounded-full border border-white/10 p-1">
                                    {variants.map((v: any, idx: number) => {
                                        const isSelected = selectedVariant === v;
                                        return (
                                            <button
                                                key={idx}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedVariant(v);
                                                }}
                                                className={cn(
                                                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                                                    isSelected ? "bg-white text-black scale-110 shadow-lg" : "text-white/50 hover:bg-white/10"
                                                )}
                                                title={v.method}
                                            >
                                                {v.method ? v.method[0].toUpperCase() : idx + 1}
                                            </button>
                                        )
                                    })}
                                 </div>
                             </div>
                         )}
                    </div>

                    {/* Footer / Actions Bar */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-40 pointer-events-none">
                        <div className="flex justify-between items-end pointer-events-auto">
                           <div className="text-white/60 text-xs hidden md:block pl-4">
                               {isProtected ? "Drag slider to compare" : "Scan complete"}
                           </div>

                           <div className="flex gap-2">
                               <ArtworkActionButtons actions={actions} hideCancel />
                           </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
