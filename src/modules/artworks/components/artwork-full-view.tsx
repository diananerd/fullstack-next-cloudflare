import { ImageIcon, ImageOff, X, Layers, ShieldCheck, Eye, Sparkles, AlertTriangle, Smartphone, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useArtworkActions } from "../hooks/use-artwork-actions";
import { useArtworkStatus } from "../hooks/use-artwork-status";
import type { Artwork } from "../schemas/artwork.schema";
// import { getArtworkDisplayUrl } from "../utils/artwork-url"; // Replaced by internal logic
import { ArtworkActionButtons } from "./artwork-action-buttons";
import { ArtworkStatusBadge } from "./artwork-status-badge";
import { ProtectionAuditTrail } from "./protection-audit-trail"; // V2 Audit Trail
import { ProtectionStatus } from "../models/artwork.enum";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ArtworkFullViewProps {
    artwork: Artwork;
    isOpen: boolean;
    onClose: () => void;
}

type VariantType = "original" | "protected" | "flux" | "sdxl" | "semantic"
    | "identity" | "identity_orig" | "mimicry" | "mimicry_orig"
    | "editing" | "editing_orig" | "watermark" | "watermark_orig";

export function ArtworkFullView({
    artwork,
    isOpen,
    onClose,
}: ArtworkFullViewProps) {
    const actions = useArtworkActions(artwork);
    const { isProtected, isProcessing, optimisticStatus } = actions;
    
    // V2: Fetch Status
    const statusData = useArtworkStatus(artwork.id, artwork.protectionStatus) as any;
    const progress = statusData?.progress; // New V2 Progress

    // Report Extraction
    const metadata = artwork.metadata as any;
    const report = metadata?.verificationReport;
    // v3: verificationReport is an array of StepResult; v1 legacy: object with keys
    const reportArr: any[] = Array.isArray(report) ? report : [];
    const hasReport = reportArr.length > 0 || (!!report && !Array.isArray(report) && !report.error);

    // v3: per-layer step results
    const stepByName = (name: string) => reportArr.find((s: any) => s.step_name === name);
    const step1 = stepByName("layer_1_identity");
    const step2 = stepByName("layer_2_mimicry");
    const step3 = stepByName("layer_3_editing");
    const step4 = stepByName("layer_4_watermark");

    // v3 availability (has artifact even if verification errored)
    const hasIdentity = !!step1?.r2_key;
    const hasIdentityOrig = !!step1?.r2_key_original;
    const hasMimicry = !!step2?.r2_key;
    const hasMimicryOrig = !!step2?.r2_key_original;
    const hasEditing = !!step3?.r2_key;
    const hasEditingOrig = !!step3?.r2_key_original;
    const hasWatermark = !!step4?.r2_key;
    const hasWatermarkOrig = !!step4?.r2_key_original;

    // v1 legacy availability (backward compat)
    const hasFlux = !Array.isArray(report) && hasReport && (!!report?.primary_attack_key || !!report?.primary_attack_url);
    const hasSDXL = !Array.isArray(report) && hasReport && (!!report?.secondary_attack_key || !!report?.secondary_attack_url);
    const hasSemantic = !Array.isArray(report) && hasReport && (!!report?.semantic_attack_key || !!report?.semantic_attack_url);

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
    
    // v3 layer artifact URLs (via authenticated asset proxy)
    const getIdentityUrl = () => step1?.r2_key ? `/api/assets/${step1.r2_key}` : "";
    const getIdentityOrigUrl = () => step1?.r2_key_original ? `/api/assets/${step1.r2_key_original}` : "";
    const getMimicryUrl = () => step2?.r2_key ? `/api/assets/${step2.r2_key}` : "";
    const getMimicryOrigUrl = () => step2?.r2_key_original ? `/api/assets/${step2.r2_key_original}` : "";
    const getEditingUrl = () => step3?.r2_key ? `/api/assets/${step3.r2_key}` : "";
    const getEditingOrigUrl = () => step3?.r2_key_original ? `/api/assets/${step3.r2_key_original}` : "";
    const getWatermarkUrl = () => step4?.r2_key ? `/api/assets/${step4.r2_key}` : "";
    const getWatermarkOrigUrl = () => step4?.r2_key_original ? `/api/assets/${step4.r2_key_original}` : "";

    // v1 legacy (backward compat)
    const getFluxUrl = () => {
        if (!Array.isArray(report)) {
            if (report?.primary_attack_url) return report.primary_attack_url;
            if (report?.primary_attack_key) return `/api/assets/${report.primary_attack_key}`;
        }
        return "";
    };
    const getSDXLUrl = () => {
        if (!Array.isArray(report)) {
            if (report?.secondary_attack_url) return report.secondary_attack_url;
            if (report?.secondary_attack_key) return `/api/assets/${report.secondary_attack_key}`;
        }
        return "";
    };
    const getSemanticUrl = () => {
        if (!Array.isArray(report)) {
            if (report?.semantic_attack_url) return report.semantic_attack_url;
            if (report?.semantic_attack_key) return `/api/assets/${report.semantic_attack_key}`;
        }
        return "";
    };

    // Determine what to show based on selectedVariant
    const getActiveUrl = () => {
        switch (selectedVariant) {
            case "protected": return getProtectedUrl();
            // v3 layer variants
            case "identity": return getIdentityUrl();
            case "identity_orig": return getIdentityOrigUrl();
            case "mimicry": return getMimicryUrl();
            case "mimicry_orig": return getMimicryOrigUrl();
            case "editing": return getEditingUrl();
            case "editing_orig": return getEditingOrigUrl();
            case "watermark": return getWatermarkUrl();
            case "watermark_orig": return getWatermarkOrigUrl();
            // v1 legacy
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
        else if (["identity", "identity_orig", "mimicry", "mimicry_orig", "editing", "editing_orig", "watermark", "watermark_orig"].includes(selectedVariant)) {
            setVariantBroken(prev => ({...prev, [selectedVariant]: true}));
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
                                    <div className="pointer-events-auto bg-black/60 backdrop-blur-md rounded-full p-1 border border-white/10 flex items-center gap-1 shadow-2xl flex-wrap justify-center max-w-[90vw]">
                                        {/* Always: Original */}
                                        <button
                                            onClick={() => setSelectedVariant("original")}
                                            className={cn(
                                                "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all",
                                                selectedVariant === "original" ? "bg-white text-black" : "text-white/60 hover:text-white hover:bg-white/10"
                                            )}
                                        >
                                            Original
                                        </button>

                                        {/* Protected final output */}
                                        {isProtectedReady && (
                                            <button
                                                onClick={() => setSelectedVariant("protected")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all",
                                                    selectedVariant === "protected" ? "bg-emerald-500 text-white" : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                                                )}
                                            >
                                                Protected
                                            </button>
                                        )}

                                        {/* v3 layer artifacts */}
                                        {hasIdentityOrig && !variantBroken["identity_orig"] && (
                                            <button
                                                onClick={() => setSelectedVariant("identity_orig")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all",
                                                    selectedVariant === "identity_orig" ? "bg-zinc-500 text-white" : "text-zinc-400 hover:text-zinc-300 hover:bg-zinc-500/10"
                                                )}
                                            >
                                                Identity ↗ Original
                                            </button>
                                        )}
                                        {hasIdentity && !variantBroken["identity"] && (
                                            <button
                                                onClick={() => setSelectedVariant("identity")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all",
                                                    selectedVariant === "identity" ? "bg-violet-500 text-white" : "text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
                                                )}
                                            >
                                                Identity ↗ Protected
                                            </button>
                                        )}
                                        {hasMimicryOrig && !variantBroken["mimicry_orig"] && (
                                            <button
                                                onClick={() => setSelectedVariant("mimicry_orig")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all",
                                                    selectedVariant === "mimicry_orig" ? "bg-zinc-500 text-white" : "text-zinc-400 hover:text-zinc-300 hover:bg-zinc-500/10"
                                                )}
                                            >
                                                Style ↗ Original
                                            </button>
                                        )}
                                        {hasMimicry && !variantBroken["mimicry"] && (
                                            <button
                                                onClick={() => setSelectedVariant("mimicry")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all",
                                                    selectedVariant === "mimicry" ? "bg-purple-500 text-white" : "text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                                                )}
                                            >
                                                Style ↗ Protected
                                            </button>
                                        )}
                                        {hasEditingOrig && !variantBroken["editing_orig"] && (
                                            <button
                                                onClick={() => setSelectedVariant("editing_orig")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all",
                                                    selectedVariant === "editing_orig" ? "bg-zinc-500 text-white" : "text-zinc-400 hover:text-zinc-300 hover:bg-zinc-500/10"
                                                )}
                                            >
                                                Edit ↗ Original
                                            </button>
                                        )}
                                        {hasEditing && !variantBroken["editing"] && (
                                            <button
                                                onClick={() => setSelectedVariant("editing")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all",
                                                    selectedVariant === "editing" ? "bg-orange-500 text-white" : "text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                                                )}
                                            >
                                                Edit ↗ Protected
                                            </button>
                                        )}
                                        {hasWatermarkOrig && !variantBroken["watermark_orig"] && (
                                            <button
                                                onClick={() => setSelectedVariant("watermark_orig")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all",
                                                    selectedVariant === "watermark_orig" ? "bg-zinc-500 text-white" : "text-zinc-400 hover:text-zinc-300 hover:bg-zinc-500/10"
                                                )}
                                            >
                                                Watermark ↗ Original
                                            </button>
                                        )}
                                        {hasWatermark && !variantBroken["watermark"] && (
                                            <button
                                                onClick={() => setSelectedVariant("watermark")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all",
                                                    selectedVariant === "watermark" ? "bg-blue-500 text-white" : "text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                                                )}
                                            >
                                                Watermark ↗ Protected
                                            </button>
                                        )}

                                        {/* v1 legacy variants (only shown for old format reports) */}
                                        {hasFlux && !variantBroken["flux"] && (
                                            <button
                                                onClick={() => setSelectedVariant("flux")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all",
                                                    selectedVariant === "flux" ? "bg-indigo-500 text-white" : "text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10"
                                                )}
                                            >Flux Audit</button>
                                        )}
                                        {hasSDXL && !variantBroken["sdxl"] && (
                                            <button
                                                onClick={() => setSelectedVariant("sdxl")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all",
                                                    selectedVariant === "sdxl" ? "bg-blue-500 text-white" : "text-blue-300 hover:text-blue-200 hover:bg-blue-500/10"
                                                )}
                                            >SDXL Audit</button>
                                        )}
                                        {hasSemantic && !variantBroken["semantic"] && (
                                            <button
                                                onClick={() => setSelectedVariant("semantic")}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all",
                                                    selectedVariant === "semantic" ? "bg-purple-500 text-white" : "text-purple-300 hover:text-purple-200 hover:bg-purple-500/10"
                                                )}
                                            >Semantic</button>
                                        )}
                                    </div>
                                </div>

                                {/* Label at bottom */}
                                <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
                                    <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full border border-white/5 text-xs text-white/80 font-medium">
                                        {selectedVariant === "original" && "Original Source"}
                                        {selectedVariant === "protected" && "Protected Asset (Final Output)"}
                                        {selectedVariant === "identity_orig" && "Identity Test — Original Image (face detection baseline)"}
                                        {selectedVariant === "identity" && "Identity Test — Protected Image (face detection disrupted)"}
                                        {selectedVariant === "mimicry_orig" && "Style Test — Original Image (VAE reconstruction baseline)"}
                                        {selectedVariant === "mimicry" && "Style Test — Protected Image (VAE reconstruction disrupted)"}
                                        {selectedVariant === "editing_orig" && "Edit Test — Original Image (AI editing baseline)"}
                                        {selectedVariant === "editing" && "Edit Test — Protected Image (AI editing disrupted)"}
                                        {selectedVariant === "watermark_orig" && "Watermark Test — Original Image (no watermark expected)"}
                                        {selectedVariant === "watermark" && "Watermark Test — Protected Image (watermark decoded)"}
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
                            <div className="flex flex-col h-full bg-zinc-950">
                                <ProtectionAuditTrail
                                    status={artwork.protectionStatus}
                                    jobResult={statusData?.progress || { steps: [] }}
                                    statusDate={artwork.updatedAt}
                                    className="border-0"
                                    r2BaseUrl="/api/assets"
                                    selectedVariant={selectedVariant}
                                    onSelectVariant={(v) => setSelectedVariant(v as VariantType)}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
