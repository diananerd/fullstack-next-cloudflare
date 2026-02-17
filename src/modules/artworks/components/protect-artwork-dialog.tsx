"use client";

import { useState, useTransition, useEffect } from "react";
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

interface ProtectArtworkDialogProps {
    artworkId: number;
    children?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

const PROTECTION_OPTIONS = [
    {
        value: "shield",
        label: "Drimit Shield V2 (Unified)",
        description: "Complete protection suite: Identity Cloaking, Style Poisoning, Edit Immunity, and Watermarking.",
        icon: ShieldCheck,
        disabled: false,
    }
];

const INTENSITY_OPTIONS = [
    { value: "Low", label: "Low (Better Quality)" },
    { value: "Medium", label: "Medium (Balanced)" },
    { value: "High", label: "High (Stronger Protection)" }
];

export function ProtectArtworkDialog({
    artworkId,
    children,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
}: ProtectArtworkDialogProps) {
    const router = useRouter();
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

    const [step, setStep] = useState(1); // 1: Config (Combined), 2: Confirm, 3: Success
    const [selectedMethods, setSelectedMethods] = useState<string[]>(["shield"]);
    
    // Config States
    // Watermark text defaults to user name or fallback
    const [watermarkText, setWatermarkText] = useState("DRIMIT SHIELD");
    // Intensity for poisoning
    const [intensity, setIntensity] = useState("Medium");
    
    const [isPending, startTransition] = useTransition();

    // Session for pre-filling watermark
    const { data: session } = authClient.useSession();

    const [eligibility, setEligibility] = useState<{
        eligible: boolean;
        missing: number;
        balance: number;
        proposedCost: number;
    } | null>(null);

    useEffect(() => {
        if (open && step === 2 && session?.user?.id) {
            setEligibility(null);
            startTransition(async () => {
                // Construct pipeline for eligibility check with correct V2 flags
                 const pipeline = [{
                    method: ProtectionMethod.SHIELD, // Use unified method
                    config: {
                        intensity, 
                        watermark_text: watermarkText,
                        // Explicitly request all layers for cost calc (if relevant)
                        layers: ["identity", "mimicry", "editing", "watermark"]
                    }
                }];
                const result = await checkArtworkProtectionEligibility(
                    session.user.id,
                    pipeline,
                );
                setEligibility(result);
            });
        }
    }, [open, step, session, selectedMethods, intensity, watermarkText]);

    useEffect(() => {
        if (open) {
            // Reset state on open
            setStep(1);
            setSelectedMethods(["shield"]); // Auto-select Shield V2
            // Resetting to default string triggers the session auto-fill effect below
            setWatermarkText("DRIMIT SHIELD");
            setIntensity("Medium");
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
        if (step === 1) {
            // Validate Config immediately since Step 1 is Config
            const result = watermarkSchema.safeParse(watermarkText);
            if (!result.success) {
                toast.error(result.error.issues[0].message);
                return;
            }
            setStep(2); // Go to Confirmation (Skip ordering)
        }
    };

    const handleBack = () => {
        if (step === 2) {
            setStep(1);
        }
    };

    const handleSubmit = () => {
        startTransition(async () => {
            const pipeline = [{
                method: ProtectionMethod.SHIELD,
                config: {
                    intensity,
                    watermark_text: watermarkText.trim(),
                    layers: ["identity", "mimicry", "editing", "watermark"]
                }
            }];

            const result = await protectArtworkAction({
                artworkId,
                pipeline,
            });

            if (result.success) {
                // Show success step
                setStep(3);
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
                {step !== 5 ? (
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
                        <div className="space-y-6">
                            
                            {/* Method Selection (Static for now) */}
                            <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                                        <ShieldCheck className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-sm">Drimit Shield V2 (Unified)</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Includes Identity Cloaking, Style Poisoning, Edit Immunity, and Watermarking.
                                        </p>
                                    </div>
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
                                            {INTENSITY_OPTIONS.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        Controls the strength of the adversarial noise. Higher intensity protects better against fine-tuning but may be more visible.
                                    </p>
                                </div>
                            </div>

                            {/* Watermark Config */}
                            <div className="space-y-3">
                                <Label className="text-xs font-semibold uppercase text-muted-foreground">
                                    Invisible Watermark
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
                        </div>
                    )}



                    {/* (Steps 2 and 3 removed) */}


                    {/* STEP 2: CONFIRMATION */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <p className="text-sm font-medium">
                                        Ready to protect?
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        This process runs in the background. It
                                        will take approximately{" "}
                                        <span className="font-semibold text-foreground">
                                            60-90 seconds
                                        </span>
                                        .
                                    </p>
                                </div>
                                
                                {eligibility && !eligibility.eligible && (
                                    <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-3">
                                        <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-semibold text-red-700">
                                                Insufficient Credits
                                            </p>
                                            <p className="text-xs text-red-600 mt-1">
                                                You need <b>{eligibility.proposedCost.toFixed(2)}</b> credits for this job, but you only have <b>{eligibility.balance.toFixed(2)}</b> available.
                                            </p>
                                        </div>
                                    </div>
                                )}
                                
                                {eligibility && eligibility.eligible && (
                                     <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                                                $
                                            </div>
                                            <div>
                                                 <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
                                                    Estimated Cost
                                                </p>
                                                <p className="text-lg font-bold text-blue-900 leading-none">
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
                                )}
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                                    Summary
                                </h4>
                                <div className="rounded-md border p-3 flex flex-col gap-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Method</span>
                                        <span className="font-medium">Shield V2 (Unified)</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Intensity</span>
                                        <span className="font-medium">{intensity}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Watermark</span>
                                        <span className="font-medium">{watermarkText || "Default"}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {step === 3 && (
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
                        "flex flex-row items-center gap-2 sm:justify-end",
                        step === 3
                            ? "justify-center sm:justify-center"
                            : "justify-end",
                    )}
                >
                    {step === 2 && (
                        <Button
                            variant="ghost"
                            onClick={handleBack}
                            disabled={isPending}
                        >
                            Back
                        </Button>
                    )}

                    {step === 1 ? (
                        <Button
                            onClick={handleNext}
                        >
                            Next <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    ) : step === 2 ? (
                        eligibility && !eligibility.eligible ? (
                             <Button 
                                onClick={() => router.push("/billing")} 
                                variant="destructive"
                            >
                                Recharge to Continue
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        ) : (
                            <Button onClick={handleSubmit} disabled={isPending || !eligibility}>
                                {isPending || !eligibility ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        {eligibility?.proposedCost === 0 ? "Start Free (0.00 Credits)" : `Start (${eligibility?.proposedCost.toFixed(2)} Credits)`}
                                        <Sparkles className="ml-2 h-4 w-4" />
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
