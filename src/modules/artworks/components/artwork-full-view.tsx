import { ImageIcon, ImageOff, X, Layers, ShieldCheck, Eye, Sparkles, AlertTriangle, Smartphone, Loader2 } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";

interface ArtworkFullViewProps {
    artwork: Artwork;
    isOpen: boolean;
    onClose: () => void;
}

type VariantType = "original" | "protected" | "flux" | "sdxl" | "semantic";

export function ArtworkFullView({
    artwork,
    isOpen,
    onClose,
}: ArtworkFullViewProps) {
    const actions = useArtworkActions(artwork);
    const { isProtected, isProcessing, optimisticStatus } = actions;

    // Report Extraction
    const metadata = artwork.metadata as any;
    const report = metadata?.verificationReport;
    const hasReport = !!report && !report.error;

    // Availability Checks based on Report Keys
    const hasFlux = hasReport && (!!report.primary_attack_key || !!report.mimicry_pixel_bytes || !!report.mimicry_bytes || !!report.primary_attack_url);
    const hasSDXL = hasReport && (!!report.secondary_attack_key || !!report.secondary_attack_url || !!report.mimicry_sdxl_bytes);
    const hasSemantic = hasReport && (!!report.semantic_attack_key || !!report.semantic_attack_url || !!report.mimicry_semantic_bytes || !!report.semantic_audit);

    // View state
    // Default to 'original' as requested
    const [selectedVariant, setSelectedVariant] = useState<VariantType>("original");
    const [imageError, setImageError] = useState(false);
    
    // Default Sidebar State: Open if hasReport AND not mobile (check width > 768px?)
    const [showAudit, setShowAudit] = useState(false);

    // Track if protected is genuinely broken (404) to disable the option
    const [protectedBroken, setProtectedBroken] = useState(false);
    // variantBroken (flux, sdxl, semantic)
    const [variantBroken, setVariantBroken] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (isOpen) {
            setImageError(false);
            setProtectedBroken(false);
            setVariantBroken({});
            
            // Default to Original
            setSelectedVariant("original");

            // Sidebar logic: Open only if report exists AND wide screen
            const isDesktop = window.innerWidth >= 768; 
            setShowAudit(hasReport && isDesktop);
        }
    }, [isOpen, hasReport]);

    useEffect(() => {
        // Fallback Logic
        if (selectedVariant === "protected" && protectedBroken) {
             setSelectedVariant("original");
        }
    }, [selectedVariant, protectedBroken]);

    // Helpers to resolve URLs
    const getProtectedUrl = () => {
        // Prefer URL from report if available
        if (report?.protected_image_url) return report.protected_image_url; 
        
        if (artwork.r2Key) {
            try {
                // Support both legacy {hash}/original vs new {userId}/{hash}/original structures
                // We strip the filename and replace it with protected.png
                const lastSlashIndex = artwork.r2Key.lastIndexOf("/");
                if (lastSlashIndex !== -1) {
                    const prefix = artwork.r2Key.substring(0, lastSlashIndex);
                    return `/api/assets/${prefix}/protected.png`;
                }
            } catch (e) {}
        }
        return "";
    };
    
    const getFluxUrl = () => {
        if (report?.primary_attack_url) return report.primary_attack_url;
        if (report?.primary_attack_key) return `/api/assets/${report.primary_attack_key}`; // Proxy if needed
        
        // Inference / Fallback
        if (artwork.r2Key) {
            const prefix = artwork.r2Key.substring(0, artwork.r2Key.lastIndexOf("/"));
            return `/api/assets/${prefix}/verified/pixel.png`;
        }
        return "";
    }

    const getSDXLUrl = () => {
        if (report?.secondary_attack_url) return report.secondary_attack_url;
        if (report?.secondary_attack_key) return `/api/assets/${report.secondary_attack_key}`;

        // Inference
        if (artwork.r2Key) {
             const prefix = artwork.r2Key.substring(0, artwork.r2Key.lastIndexOf("/"));
             return `/api/assets/${prefix}/verified/sdxl.png`;
        }
        return "";
    }

    const getSemanticUrl = () => {
         if (report?.semantic_attack_url) return report.semantic_attack_url;
         if (report?.semantic_attack_key) return `/api/assets/${report.semantic_attack_key}`;

         if (artwork.r2Key) {
             const prefix = artwork.r2Key.substring(0, artwork.r2Key.lastIndexOf("/"));
             return `/api/assets/${prefix}/verified/semantic.png`;
         }
         return "";
    }

    // Determine what to show based on selectedVariant
    const getActiveUrl = () => {
        switch (selectedVariant) {
            case "protected": return getProtectedUrl();
            case "flux": return getFluxUrl();
            case "sdxl": return getSDXLUrl();
            case "semantic": return getSemanticUrl();
            case "original": 
            default:
                return artwork.url;
        }
    };
    
    const activeUrl = getActiveUrl();
    const isProtectedReady = !!getProtectedUrl() && optimisticStatus === ProtectionStatus.DONE && !protectedBroken;

    
    // Add loading state
    const [isImageLoading, setIsImageLoading] = useState(false);

    // Effects
    useEffect(() => {
        // When dialog opens, reset states
        if (isOpen) {
            setSelectedVariant("original");
            setImageError(false);
            setVariantBroken({flux: false, sdxl: false, semantic: false});
            setProtectedBroken(false);
            setIsImageLoading(true);
        }
    }, [isOpen, artwork.id]);
    
    // Trigger loading when activeUrl changes
    useEffect(() => {
        setIsImageLoading(true);
    }, [activeUrl]);

    const handleImageLoad = () => {
        setIsImageLoading(false);
    };

    const handleImageError = () => {
        setIsImageLoading(false);
        if (selectedVariant === "protected") {
             setProtectedBroken(true);
             setSelectedVariant("original");
        }
        else if (selectedVariant === "flux") {
             setVariantBroken(prev => ({...prev, flux: true}));
             setSelectedVariant("original");
        }
        else if (selectedVariant === "sdxl") {
             setVariantBroken(prev => ({...prev, sdxl: true}));
             setSelectedVariant("original");
        }
        else if (selectedVariant === "semantic") {
             setVariantBroken(prev => ({...prev, semantic: true}));
             setSelectedVariant("original");
        } 
        else {
             setImageError(true);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                showCloseButton={false}
                className="fixed top-0 left-0 !max-w-none w-screen h-[100dvh] p-0 m-0 translate-x-0 translate-y-0 rounded-none border-none bg-black flex flex-col items-center justify-center overflow-hidden focus:outline-none ring-0 outline-none data-[state=open]:slide-in-from-bottom-0"
            >
                <DialogTitle className="sr-only">{artwork.title}</DialogTitle>

                <div className="flex w-full h-full bg-black overflow-hidden select-none">
                    <div className="relative flex-1 h-full flex items-center justify-center overflow-hidden">
                        
                        {/* MAIN IMAGE DISPLAY (Unified) */}
                        {!imageError ? (
                             <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
                                {isImageLoading && (
                                    <div className="absolute inset-0 flex items-center justify-center z-20">
                                         <Loader2 className="w-10 h-10 text-white/50 animate-spin" />
                                    </div>
                                )}
                                
                                {/* biome-ignore lint/performance/noImgElement: External/Dynamic URL */}
                                <img 
                                    src={activeUrl} 
                                    alt={selectedVariant}
                                    className={cn(
                                        "max-w-full max-h-full object-contain transition-all duration-300", 
                                        showAudit ? "scale-90" : "scale-100",
                                        isImageLoading ? "opacity-0 scale-95 blur-sm" : "opacity-100 blur-0"
                                    )} 
                                    onLoad={handleImageLoad}
                                    onError={handleImageError}
                                />
                                
                                {/* VARIANT SWITCHER OVERLAY */}
                                <div className="absolute bottom-14 left-0 right-0 z-30 flex justify-center pointer-events-none">
                                    <div className="pointer-events-auto bg-black/60 backdrop-blur-md rounded-full p-1 border border-white/10 flex items-center gap-1 shadow-2xl">
                                        <button 
                                            onClick={() => setSelectedVariant("original")}
                                            className={cn(
                                                "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all", 
                                                selectedVariant === "original" ? "bg-white text-black" : "text-white/60 hover:text-white hover:bg-white/10"
                                            )}
                                        >
                                            Original
                                        </button>
                                        
                                        {isProtectedReady && (
                                            <button 
                                                onClick={() => setSelectedVariant("protected")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all flex items-center gap-1.5", 
                                                    selectedVariant === "protected" ? "bg-emerald-500 text-white" : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                                                )}
                                            >
                                                Protected
                                            </button>
                                        )}

                                        {/* Flux: Only if reported as existing */}
                                        {hasFlux && (
                                            <button 
                                                onClick={() => setSelectedVariant("flux")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all flex items-center gap-1.5", 
                                                    selectedVariant === "flux" 
                                                        ? "bg-indigo-500 text-white" 
                                                        : variantBroken["flux"] ? "hidden" : "text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10"
                                                )}
                                            >
                                                Flux Audit
                                            </button>
                                        )}

                                        {/* SDXL: Only if reported as existing */}
                                        {hasSDXL && (
                                            <button 
                                                onClick={() => setSelectedVariant("sdxl")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all flex items-center gap-1.5", 
                                                    selectedVariant === "sdxl" 
                                                        ? "bg-blue-500 text-white" 
                                                        : variantBroken["sdxl"] ? "hidden" : "text-blue-300 hover:text-blue-200 hover:bg-blue-500/10"
                                                )}
                                            >
                                                SDXL Audit
                                            </button>
                                        )}

                                        {/* Semantic: Only if reported as existing */}
                                        {hasSemantic && (
                                            <button 
                                                onClick={() => setSelectedVariant("semantic")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all flex items-center gap-1.5", 
                                                    selectedVariant === "semantic" 
                                                        ? "bg-purple-500 text-white" 
                                                        : variantBroken["semantic"] ? "hidden" : "text-purple-300 hover:text-purple-200 hover:bg-purple-500/10"
                                                )}
                                            >
                                                Semantic
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Label at bottom */}
                                <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
                                    <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full border border-white/5 text-xs text-white/80 font-medium">
                                        {selectedVariant === "original" && "Original Source"}
                                        {selectedVariant === "protected" && "Protected Asset"}
                                        {selectedVariant === "flux" && "Flux.1-Schnell Attack Simulation"}
                                        {selectedVariant === "sdxl" && "SDXL-Turbo Attack Simulation"}
                                        {selectedVariant === "semantic" && "Concept Reconstruction"}
                                    </div>
                                </div>

                             </div>
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

                        {/* HUD Overlay within Image Area */}
                        <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none">
                            {/* Top Row */}
                            <div className="flex justify-between items-start w-full">
                                {/* Top-Left: Close Button + Status */}
                                <div className="pointer-events-auto flex items-center gap-3">
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        className="h-8 w-8 bg-black/60 hover:bg-white/20 text-white rounded-full border-0 shadow-sm backdrop-blur-md"
                                        onClick={onClose}
                                        title="Close"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                    <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-full text-xs font-medium text-white/90 select-none border border-white/5">
                                         <ArtworkStatusBadge status={optimisticStatus} />
                                    </div>
                                </div>

                                {/* Top-Right: Action Group */}
                                <div className="flex items-center gap-2 pointer-events-auto">
                                     <ArtworkActionButtons actions={actions} />
                                </div>
                            </div>
                        </div>

                         {/* Sidebar Toggle Tab - Attached to Layout */}
                         {hasReport && (
                            <button
                                onClick={() => setShowAudit(!showAudit)}
                                className={cn(
                                    "absolute top-1/2 -translate-y-1/2 z-30 flex items-center justify-center w-8 h-12 bg-zinc-950 border border-white/10 border-r-0 rounded-l-md text-emerald-400 shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all duration-300 pointer-events-auto hover:bg-zinc-900 cursor-pointer",
                                    // Position: Always anchored to the right edge of this container (which shrinks on desktop)
                                    "right-0",
                                    // On mobile, if sidebar is open, this container doesn't shrink, so we shift the button left to keep it visible
                                    showAudit ? "max-md:translate-x-[-85vw] max-md:sm:translate-x-[-360px]" : "translate-x-0"
                                )}
                                title={showAudit ? "Close Report" : "View Report"}
                            >
                                <ShieldCheck className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    {/* Sidebar: Audit Report Panel */}
                    <div className={cn(
                        "h-full bg-zinc-950 border-l border-white/10 flex flex-col transition-all duration-300 ease-in-out shrink-0",
                        // Mobile: Absolute overlay
                        "absolute right-0 top-0 bottom-0 md:relative z-40",
                        // Width & Visibility Logic
                        showAudit 
                            ? "w-[85vw] sm:w-[360px] translate-x-0 opacity-100" 
                            : "w-[85vw] sm:w-0 translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden md:border-none md:opacity-0"
                    )}>
                        {showAudit && ( // Conditional render content to avoid layout thrashing when width is 0
                            <>
                                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5 shrink-0">
                                    <div className="flex items-center gap-2 text-emerald-400">
                                        <ShieldCheck className="w-5 h-5" />
                                        <span className="text-base font-semibold">Protection Report</span>
                                    </div>
                                    <span className="text-[10px] uppercase tracking-wider text-white/40 font-mono">SHIELD-V5</span>
                                </div>
                                <ScrollArea className="flex-1">
                                    <div className="p-4 space-y-6 text-sm text-white/80">
                                        
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-white/60 text-xs uppercase tracking-wider font-bold">
                                                <Eye className="w-3.5 h-3.5" />
                                                <span>Semantic Scan (VLM)</span>
                                            </div>
                                            <p className="leading-relaxed bg-white/5 p-3 rounded-md text-xs border border-white/5 text-gray-300">
                                                "{report?.semantic_audit?.generated_caption || report?.generated_caption || "Analysis not available"}"
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                             <div className="flex items-center gap-2 text-white/60 text-xs uppercase tracking-wider font-bold">
                                                <Sparkles className="w-3.5 h-3.5" />
                                                <span>Detected Concepts</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {(report?.semantic_audit?.detected_tags || report?.detected_tags || "")?.split(',').map((tag: string, i: number) => (
                                                    <span key={i} className="px-2 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded text-xs">
                                                        {tag.trim()}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                         <div className="space-y-2">
                                             <div className="flex items-center gap-2 text-white/60 text-xs uppercase tracking-wider font-bold">
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                <span>Visual Integrity</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    "px-2 py-1 rounded text-xs font-medium border",
                                                    ((report?.pixel_audit?.perceived_quality || report?.perceived_quality) || "")?.toLowerCase().includes("yes") 
                                                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                                                        : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                                )}>
                                                    High Quality: {report?.pixel_audit?.perceived_quality || report?.perceived_quality || "Unknown"}
                                                </span>
                                            </div>
                                        </div>

                                        {/* New Process Details Section */}
                                        <div className="pt-4 border-t border-white/10 space-y-3">
                                            <div className="flex items-center gap-2 text-white/60 text-xs uppercase tracking-wider font-bold">
                                                <Layers className="w-3.5 h-3.5" />
                                                <span>Defense Telemetry</span>
                                            </div>
                                            
                                            <div className="bg-white/5 p-3 rounded-md border border-white/5 space-y-2 text-xs font-mono text-gray-400">
                                                {/* Active Layers using Chips/Badges */}
                                                 <div className="flex flex-col gap-2 pb-2 mb-2 border-b border-white/5">
                                                    <span className="text-[10px] uppercase text-white/40">Active Layers</span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {report?.protection_config?.apply_concept_poison && (
                                                            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">Concept</span>
                                                        )}
                                                        {report?.protection_config?.apply_poison && (
                                                            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">Adversarial</span>
                                                        )}
                                                        {report?.protection_config?.apply_watermark && (
                                                            <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">Steganography</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex justify-between items-center">
                                                    <span className="text-white/60">Intensity:</span>
                                                    <span className="text-white bg-white/10 px-1.5 rounded">{report?.protection_config?.intensity || "Custom"}</span>
                                                </div>
                                                
                                                {/* Watermark Verification Result */}
                                                {report?.protection_config?.apply_watermark && (
                                                    <div className="flex justify-between items-center">
                                                        <span>Watermark Verify:</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={cn("px-1.5 rounded text-[10px] uppercase font-bold", 
                                                                report?.watermark_audit?.detected || report?.watermark_detected 
                                                                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" 
                                                                    : "bg-red-500/20 text-red-400 border border-red-500/30"
                                                            )}>
                                                                {(report?.watermark_audit?.detected || report?.watermark_detected) ? "DETECTED" : "MISSING"}
                                                            </span>
                                                            {(report?.watermark_audit?.score !== undefined || report?.watermark_score !== undefined) && (
                                                                <span className="text-white/50 text-[10px]">
                                                                    ({(report?.watermark_audit?.score || report?.watermark_score || 0).toFixed(1)}%)
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex justify-between items-center">
                                                    <span>Protection Field:</span>
                                                    <div className="text-right">
                                                        <span className={cn("text-white font-medium block", 
                                                            (report?.poison_metrics?.epsilon || 0.04) > 0.04 ? "text-amber-400" : "text-emerald-400"
                                                        )}>
                                                            {(report?.poison_metrics?.epsilon || 0.04) >= 0.05 ? "Max Intensity" : 
                                                             (report?.poison_metrics?.epsilon || 0.04) >= 0.03 ? "Standard" : "Low Impact"}
                                                        </span>
                                                        <span className="text-[9px] text-white/30 uppercase tracking-widest block">
                                                            (ε = {report?.poison_metrics?.epsilon || report?.protection_config?.epsilon || "0.04"})
                                                        </span>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex justify-between items-center">
                                                    <span>Computation Depth:</span>
                                                    <div className="text-right">
                                                        <span className="text-white font-medium block">
                                                            {(report?.poison_metrics?.steps || 100) >= 150 ? "Deep Optimization" : "Standard Cycle"}
                                                        </span>
                                                        <span className="text-[9px] text-white/30 uppercase tracking-widest block">
                                                            ({report?.poison_metrics?.steps || "100"} Iterations)
                                                        </span>
                                                    </div>
                                                </div>

                                                 {report?.poison_metrics?.final_loss && (
                                                    <div className="flex justify-between items-center">
                                                        <span>Pattern Integrity:</span>
                                                        <div className="text-right">
                                                            <span className={cn("font-medium block", report.poison_metrics.final_loss < 0.1 ? "text-emerald-400" : "text-amber-400")}>
                                                                {report.poison_metrics.final_loss < 0.05 ? "Optimal Linkage" : 
                                                                 report.poison_metrics.final_loss < 0.1 ? "Stable" : "Variant"}
                                                            </span>
                                                            <span className="text-[9px] text-white/30 uppercase tracking-widest block">
                                                                (Loss: {Number(report.poison_metrics.final_loss).toFixed(4)})
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                <div className="flex justify-between items-center">
                                                    <span>Compute Duration:</span>
                                                    <div className="text-right">
                                                        <span className="text-white block">
                                                            {report?.poison_metrics?.time ? `${Number(report.poison_metrics.time).toFixed(1)}s` : "N/A"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                         {/* Simulation Details Section */}
                                         <div className="space-y-2 pt-3 border-t border-white/5 mt-2">
                                             <div className="flex items-center gap-2 text-white/60 text-xs uppercase tracking-wider font-bold mb-2">
                                                <Smartphone className="w-3.5 h-3.5" />
                                                <span>Defense Capability Audit</span>
                                            </div>
                                            
                                            <div className="bg-white/5 p-3 rounded-md border border-white/5 space-y-2 text-xs font-mono text-gray-400">
                                                <div className="flex justify-between items-center">
                                                    <span>Flux.1 (Modern AI):</span>
                                                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border", report?.pixel_audit?.flux_success === false ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-300 border-amber-500/20")}>
                                                        {report?.pixel_audit?.flux_success === false ? "Neutralized" : "Partial Leak"}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span>SDXL (Legacy AI):</span>
                                                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border", report?.pixel_audit?.sdxl_success === false ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-300 border-amber-500/20")}>
                                                        {report?.pixel_audit?.sdxl_success === false ? "Neutralized" : "Partial Leak"}
                                                    </span>
                                                </div>
                                                
                                                <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-2">
                                                    <div>
                                                         <span className="text-[9px] text-white/40 uppercase block mb-0.5">Stress Load</span>
                                                         <span className="text-white">
                                                            {(report?.pixel_audit?.attack_strength || 0.6) > 0.7 ? "Extreme" : "Standard"}
                                                            <span className="text-white/30 ml-1">({report?.pixel_audit?.attack_strength ?? 0.6})</span>
                                                         </span>
                                                    </div>
                                                    <div>
                                                         <span className="text-[9px] text-white/40 uppercase block mb-0.5">Guidance</span>
                                                         <span className="text-white">
                                                            {(report?.pixel_audit?.attack_guidance || 0.0) === 0 ? "Unconstrained" : "Guided"}
                                                             <span className="text-white/30 ml-1">({report?.pixel_audit?.attack_guidance ?? 0.0})</span>
                                                         </span>
                                                    </div>
                                                </div>
                                                
                                                <div className="pt-2 mt-1 border-t border-white/5">
                                                    <span className="text-[9px] uppercase text-white/40 mb-1 block flex items-center gap-1">
                                                        <Eye className="w-3 h-3" />
                                                        Context Perception
                                                    </span>
                                                    <p className="text-[10px] text-white/70 italic leading-relaxed break-words bg-black/20 p-1.5 rounded border border-white/5">
                                                        "{report?.pixel_audit?.attack_prompt || report?.attack_prompt || report?.generated_caption?.substring(0, 100) || "Evaluating visual context..."}"
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                </ScrollArea>
                        </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
