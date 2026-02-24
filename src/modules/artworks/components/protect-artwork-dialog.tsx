"use client";

import { useState, useTransition, useEffect } from "react";
import { usePostHog } from "posthog-js/react";
import { toast } from "react-hot-toast";
import { z } from "zod";
import {
    Loader2,
    ShieldCheck,
    Wand2,
    Droplets,
    ArrowUp,
    ArrowDown,
    ArrowRight,
    ArrowLeft,
    AlertTriangle,
    Check,
    Fingerprint,
    Sparkles,
    Smartphone,
    Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/modules/auth/utils/auth-client";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
    ProtectionMethod,
    type ProtectionMethodType,
} from "@/modules/artworks/models/artwork.enum";
import { protectArtworkAction } from "../actions/protect-artwork.action";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { PROTECTION_PRICING, DEFAULT_PROCESS_COST } from "@/constants/pricing.constant";
import { checkArtworkProtectionEligibility } from "../actions/check-eligibility.action";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePWA } from "@/providers/pwa-provider";
import { PIPELINE_LAYERS, PIPELINE_GLOBAL_CONFIG } from "@/constants/pipeline-contract";

interface ProtectArtworkDialogProps {
    artworkId: number;
    children?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

// Layer options and intensity are derived from the Pipeline Contract.
// See src/constants/pipeline-contract.ts to add/edit layers or config options.

export function ProtectArtworkDialog({
    artworkId,
    children,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
}: ProtectArtworkDialogProps) {
    const router = useRouter();
    const ph = usePostHog();
    const [internalOpen, setInternalOpen] = useState(false);
    const { isInstalled, canInstall, promptInstall } = usePWA();
    
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    // Safe setter that handles both modes
    const setOpen = (newOpen: boolean) => {
        if (isControlled) {
            controlledOnOpenChange?.(newOpen);
        } else {
            setInternalOpen(newOpen);
        }
    };

    const [step, setStep] = useState(1);

    // Config States
    const [watermarkText, setWatermarkText] = useState("DRIMIT SHIELD");
    const [intensity, setIntensity] = useState<string>(PIPELINE_GLOBAL_CONFIG.intensity.default);

    // Layer flags — driven by PIPELINE_LAYERS contract, no hardcoding
    const [layerFlags, setLayerFlags] = useState<Record<string, boolean>>(
        () => Object.fromEntries(PIPELINE_LAYERS.map((l) => [l.id, l.defaultEnabled])),
    );
    const setLayerFlag = (id: string, val: boolean) =>
        setLayerFlags((prev) => ({ ...prev, [id]: val }));
    
    const [isPending, startTransition] = useTransition();

    // Session for pre-filling watermark
    const { data: session } = authClient.useSession();

    const [eligibility, setEligibility] = useState<{
        eligible: boolean;
        missing: number;
        balance: number;
        proposedCost: number;
    } | null>(null);

    // Build active layers array from contract — adding a layer to the contract is enough
    const getActiveLayers = () =>
        PIPELINE_LAYERS.filter((l) => layerFlags[l.id]).map((l) => l.layerKey);

    // Combined Effect: Fetch cost/eligibility whenever config changes
    useEffect(() => {
        if (open && step === 1 && session?.user?.id) {
            // Debounce slightly or just run
            const timer = setTimeout(() => {
                startTransition(async () => {
                    const pipeline = [{
                        method: ProtectionMethod.SHIELD,
                        config: {
                            intensity,
                            watermark_text: watermarkText,
                            layers: getActiveLayers()
                        }
                    }];
                    const result = await checkArtworkProtectionEligibility(
                        session.user.id,
                        pipeline,
                    );
                    setEligibility(result);
                });
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [open, step, session, intensity, watermarkText, layerFlags]);

    useEffect(() => {
        if (open) {
            // Reset state on open
            setStep(1);
            // Resetting to default string triggers the session auto-fill effect below
            setWatermarkText("DRIMIT SHIELD");
            setIntensity("Medium");
            // Reset layer flags to contract defaults
            setLayerFlags(Object.fromEntries(PIPELINE_LAYERS.map((l) => [l.id, l.defaultEnabled])));
            // Track dialog open
            ph?.capture("protection_dialog_opened", { artwork_id: artworkId });
        }
    }, [open]);

    useEffect(() => {
        if (session?.user?.name && watermarkText === "DRIMIT SHIELD") {
            let sanitized = session.user.name.replace(
                /[^a-zA-Z0-9\sáéíóúÁÉÍÓÚñÑ.,!?-]/g,
                "",
            );
            sanitized = sanitized.replace(/\s+/g, " ").trim();
            if (sanitized) {
                setWatermarkText(sanitized.substring(0, 25));
            }
        }
    }, [session, watermarkText]);

    const watermarkSchema = z
        .string()
        .trim()
        .min(1, "Watermark text is required.")
        .max(25, "Watermark text cannot exceed 25 characters.")
        .regex(/^[a-zA-Z0-9\sáéíóúÁÉÍÓÚñÑ.,!?-]+$/, {
            message: "Invalid characters detected.",
        });

    const handleNext = () => {
        // Now handles direct submission validation
        if (step === 1) {
            const result = watermarkSchema.safeParse(watermarkText);
            if (!result.success) {
                toast.error(result.error.issues[0].message);
                return;
            }
            // Proceed to submit directly
            handleSubmit();
        }
    };

    const handleBack = () => {
        // No step 2 anymore, just close or reset? 
        // If we are in Config, back closes.
        handleClose();
    };

    const handleSubmit = () => {
        startTransition(async () => {
             const pipeline = [{
                method: ProtectionMethod.SHIELD,
                config: {
                    intensity,
                    watermark_text: watermarkText.trim(),
                    layers: getActiveLayers()
                }
            }];

            const result = await protectArtworkAction({
                artworkId,
                pipeline,
            });

            if (result.success) {
                // Show success step (now Step 2)
                setStep(2);
                // Survey targeting: fires when protection is queued.
                // Configure PostHog surveys to trigger on this event.
                ph?.capture("protection_pipeline_queued", { artwork_id: artworkId });
                // Ideally refresh page or invalidate cache here
                router.refresh();
            } else {
                toast.error(result.error || "Failed to start protection");
            }
        });
    };

    const handleClose = () => {
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[450px]">
                {step === 1 ? (
                    <DialogHeader>
                        <DialogTitle>Protect Artwork</DialogTitle>
                        <DialogDescription>
                            Configure your protection pipeline.
                        </DialogDescription>
                    </DialogHeader>
                ) : (
                    <DialogTitle className="sr-only">
                        Protection Started
                    </DialogTitle>
                )}

                <div className="py-2">
                    {/* STEP 1: CONFIGURATION */}
                    {step === 1 && (
                        <>
                        <div className="space-y-6">
                            
                            {/* Protection Layers Selection */}
                            <div className="space-y-3">
                                <Label className="text-xs font-semibold uppercase text-muted-foreground">
                                    Active Protections
                                </Label>
                                <div className="grid grid-cols-1 gap-2 rounded-md border p-3 bg-muted/20">
                                    {PIPELINE_LAYERS.map((layer) => (
                                        <div key={layer.id} className="flex items-start space-x-3 p-1">
                                            <Checkbox
                                                id={`use-${layer.id}`}
                                                checked={layerFlags[layer.id]}
                                                onCheckedChange={(c) => setLayerFlag(layer.id, !!c)}
                                            />
                                            <div className="grid gap-1.5 leading-none">
                                                <Label htmlFor={`use-${layer.id}`} className="text-sm font-medium cursor-pointer">
                                                    {layer.label}
                                                </Label>
                                                <p className="text-xs text-muted-foreground">{layer.uiDescription}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Intensity Config */}
                            <div className="space-y-3">
                                <Label className="text-xs font-semibold uppercase text-muted-foreground">
                                    Protection Intensity
                                </Label>
                                <div className="space-y-2">
                                     <Select value={intensity} onValueChange={setIntensity}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select intensity" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PIPELINE_GLOBAL_CONFIG.intensity.options.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        {PIPELINE_GLOBAL_CONFIG.intensity.helpText}
                                    </p>
                                </div>
                            </div>

                            {/* Watermark Config - Only if watermark layer is enabled */}
                            {layerFlags["layer_4_watermark"] && (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <Label className="text-xs font-semibold uppercase text-muted-foreground">
                                        Watermark Text
                                    </Label>
                                    <div className="space-y-2">
                                        <Label htmlFor="watermark" className="sr-only">
                                            Text Content
                                        </Label>
                                        <Input
                                            id="watermark"
                                            value={watermarkText}
                                            onChange={(e) =>
                                                setWatermarkText(e.target.value)
                                            }
                                            placeholder="Enter custom watermark text"
                                            maxLength={25}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            This text will be embedded into the image frequency domain. 
                                            (Max 25 chars)
                                        </p>
                                    </div>
                                </div>
                            )}

                        </div>

                         {/* Cost / Eligibility Card (Live) */}
                         <div className="pt-4 animate-in fade-in slide-in-from-bottom-2">
                             {eligibility ? (
                                 !eligibility.eligible ? (
                                    <div className="rounded-md border border-red-200 bg-red-50 p-3 flex gap-3 items-start">
                                        <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-semibold text-red-700">Insufficient Credits</p>
                                            <p className="text-xs text-red-600 mt-1">
                                                Required: <b>{eligibility.proposedCost.toFixed(2)}</b> • Available: <b>{eligibility.balance.toFixed(2)}</b>
                                            </p>
                                        </div>
                                    </div>
                                 ) : (
                                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                                                $
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
                                                    Estimated Cost
                                                </p>
                                                <p className="text-lg font-bold leading-none text-blue-900">
                                                    {eligibility.proposedCost.toFixed(2)} Credits
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-blue-600">
                                                Balance: {eligibility.balance.toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                 )
                             ) : (
                                 <div className="h-[74px] rounded-md border border-muted bg-muted/10 animate-pulse" />
                             )}
                         </div>
                        </>
                    )}


                    {step === 2 && (
                        <div className="flex flex-col items-center justify-center py-6 text-center space-y-4 animate-in fade-in zoom-in duration-300">
                            <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-2">
                                <Check className="h-8 w-8" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-lg font-semibold">
                                    Protection Started!
                                </h3>
                                <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-4">
                                    Your artwork is now being processed by our
                                    secure pipeline.
                                </p>
                                
                                {canInstall && !isInstalled && (
                                    <div className="pt-4 border-t border-border w-full animate-in slide-in-from-bottom-2 fade-in duration-500 delay-300">
                                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-2">
                                            <p className="text-sm font-medium text-blue-900 mb-2">
                                                Install Drimit App
                                            </p>
                                            <p className="text-xs text-blue-700 mb-3 leading-relaxed">
                                                Install our app for faster access, notifications, and easier uploads.
                                            </p>
                                            <Button 
                                                onClick={promptInstall} 
                                                variant="default" 
                                                size="sm"
                                                className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
                                            >
                                                <Smartphone className="h-4 w-4" />
                                                Install App
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter
                    className={cn(
                        "flex flex-row items-center gap-2",
                        step === 2
                            ? "justify-center sm:justify-center"
                            : "justify-between sm:justify-between",
                    )}
                >
                    {step === 1 && (
                        <Button
                            variant="ghost"
                            onClick={handleClose}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                    )}

                    {step === 1 ? (
                         eligibility && !eligibility.eligible ? (
                             <Button 
                                onClick={() => router.push("/billing")} 
                                variant="destructive"
                            >
                                Recharge
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        ) : (
                            <Button onClick={handleNext} disabled={isPending || !eligibility}>
                                {isPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        Protect Artwork
                                        <ShieldCheck className="ml-2 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        )
                    ) : (
                        <Button onClick={handleClose} variant={canInstall && !isInstalled ? "ghost" : "default"} className="min-w-[100px]">
                            {canInstall && !isInstalled ? "Maybe Later" : "Close"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
