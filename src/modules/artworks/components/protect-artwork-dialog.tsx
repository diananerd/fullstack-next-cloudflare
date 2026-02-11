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
        value: "poison-ivy",
        label: "AI Poisoning",
        description: "Applies subtle perturbations to disrupt AI recognition (Poison Ivy).",
        icon: ShieldCheck,
        disabled: false,
    },
    {
        value: "ai-watermark",
        label: "AI Watermark (Invisible)",
        description: "Adds an invisible signature to prove ownership.",
        icon: Fingerprint,
        disabled: false,
    },
    {
        value: "visual-watermark",
        label: "Visual Watermark",
        description: "Overlays visible text on the image.",
        icon: Droplets,
        disabled: false,
    },
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

    const [step, setStep] = useState(1);
    const [selectedMethods, setSelectedMethods] = useState<string[]>([]);

    // Config States
    // Watermark text is the only user input needed for these options
    const [watermarkText, setWatermarkText] = useState("DRIMIT SHIELD");
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
        if (open && step === 4 && session?.user?.id) {
            setEligibility(null);
            startTransition(async () => {
                // Construct pipeline for eligibility check with correct flags
                 const pipeline = [{
                    method: ProtectionMethod.POISONING,
                    config: {
                        apply_poison: selectedMethods.includes("poison-ivy"),
                        apply_watermark: selectedMethods.includes("ai-watermark"),
                        apply_visual_watermark: selectedMethods.includes("visual-watermark"),
                    }
                }];
                const result = await checkArtworkProtectionEligibility(
                    session.user.id,
                    pipeline,
                );
                setEligibility(result);
            });
        }
    }, [open, step, session, selectedMethods]);

    useEffect(() => {
        if (open) {
            // Reset state on open to avoid pollution from previous runs
            setStep(1);
            setSelectedMethods([]);
            // Resetting to default string triggers the session auto-fill effect below
            setWatermarkText("DRIMIT SHIELD");
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

    const toggleMethod = (method: string) => {
        if (selectedMethods.includes(method)) {
            setSelectedMethods(selectedMethods.filter((m) => m !== method));
        } else {
            // Respect default order when adding
            const newSelection = [...selectedMethods, method];
            // Sort based on PROTECTION_OPTIONS index so order is consistent
            newSelection.sort((a, b) => {
                const idxA = PROTECTION_OPTIONS.findIndex((o) => o.value === a);
                const idxB = PROTECTION_OPTIONS.findIndex((o) => o.value === b);
                return idxA - idxB;
            });
            setSelectedMethods(newSelection);
        }
    };

    const moveMethod = (index: number, direction: "up" | "down") => {
        // No longer needed with flat list
    };

    const hasConfigStep =
        selectedMethods.includes("visual-watermark"); // Only visual watermark needs text input for now

    const handleNext = () => {
        if (step === 1) {
            if (selectedMethods.length === 0) {
                toast.error("Please select at least one method.");
                return;
            }
            
            // SKIP Step 2 (Ordering) completely as requested
            if (hasConfigStep) {
                setStep(3);
            } else {
                setStep(4);
            }
        } else if (step === 3) {
            // Validate config if needed
            if (selectedMethods.includes("visual-watermark")) {
                const result = watermarkSchema.safeParse(watermarkText);
                if (!result.success) {
                    toast.error(result.error.issues[0].message);
                    return;
                }
            }
            setStep(4);
        }
    };

    const handleBack = () => {
        // Step 2 is skipped, so back from 3 goes to 1
        if (step === 3) {
            setStep(1);
        } else if (step === 4) {
            if (hasConfigStep) {
                setStep(3);
            } else {
                setStep(1);
            }
        }
    };

    const handleSubmit = () => {
        startTransition(async () => {
             // Construct single pipeline step: POISONING with flags
            const hasPoison = selectedMethods.includes("poison-ivy");
            const hasAiWatermark = selectedMethods.includes("ai-watermark");
            const hasVisualWatermark = selectedMethods.includes("visual-watermark");
            
            if (!hasPoison && !hasAiWatermark && !hasVisualWatermark) {
                toast.error("Please select at least one protection method.");
                return;
            }

            const pipeline = [{
                method: ProtectionMethod.POISONING,
                config: {
                    apply_poison: hasPoison,
                    apply_watermark: hasAiWatermark,
                    apply_visual_watermark: hasVisualWatermark,
                    watermark_text: watermarkText.trim()
                }
            }];

            const result = await protectArtworkAction({
                artworkId,
                pipeline,
            });

            if (result.success) {
                // Show success step instead of closing immediately
                setStep(5);
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
                    {/* STEP 1: SELECTION */}
                    {step === 1 && (
                        <div className="space-y-4">
                            <h3 className="font-semibold text-sm text-foreground/80">
                                Select Methods
                            </h3>
                            <div className="grid gap-3">
                                {PROTECTION_OPTIONS.map((option) => {
                                    const Icon = option.icon;
                                    const isSelected = selectedMethods.includes(
                                        option.value,
                                    );
                                    const isDisabled = option.disabled;

                                    if (isDisabled) {
                                        return (
                                            <div
                                                key={option.value}
                                                className="flex items-start space-x-3 rounded-md border border-muted/60 p-3 opacity-60 cursor-not-allowed bg-muted/10 grayscale-[0.5]"
                                            >
                                                <Checkbox
                                                    disabled
                                                    className="mt-1"
                                                />
                                                <div className="flex-1 space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <Icon className="h-4 w-4 text-foreground/70" />
                                                        <p className="font-medium text-sm leading-none flex items-center gap-2">
                                                            {option.label}
                                                            <Badge
                                                                variant="outline"
                                                                className="text-[10px] h-4 px-1 py-0 border-muted-foreground/40 text-muted-foreground font-normal"
                                                            >
                                                                Coming Soon
                                                            </Badge>
                                                        </p>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        {option.description}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                            <div
                                                key={option.value}
                                                className={cn(
                                                    "flex items-start space-x-3 rounded-md border p-3 cursor-pointer transition-colors",
                                                    isSelected
                                                        ? "border-primary/50 bg-primary/5"
                                                        : "border-muted",
                                                )}
                                                onClick={() =>
                                                    toggleMethod(
                                                        option.value,
                                                    )
                                                }
                                            >
                                                <Checkbox
                                                    checked={isSelected}
                                                    onCheckedChange={() =>
                                                        toggleMethod(
                                                            option.value,
                                                        )
                                                    }
                                                    className="mt-1"
                                                />
                                            <div className="flex-1 space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <Icon className="h-4 w-4 text-foreground/70" />
                                                    <p className="font-medium text-sm leading-none">
                                                        {option.label}
                                                    </p>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    {option.description}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* STEP 2: ORDERING */}
                    {step === 2 && (
                        <div className="space-y-4">
                            <h3 className="font-semibold text-sm text-foreground/80">
                                Pipeline Execution Order
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                Reorder steps if necessary. The output of one
                                step feeds into the next.
                            </p>

                            <div className="space-y-2">
                                {selectedMethods.map((method, index) => {
                                    const details = PROTECTION_OPTIONS.find(
                                        (o) => o.value === method,
                                    );
                                    return (
                                        <div
                                            key={method}
                                            className="flex items-center justify-between rounded-md border p-2 bg-muted/30"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Badge
                                                    variant="outline"
                                                    className="h-5 w-5 rounded-full flex items-center justify-center p-0 text-[10px] bg-background"
                                                >
                                                    {index + 1}
                                                </Badge>
                                                <span className="text-sm font-medium leading-none">
                                                    {details?.label || method}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    disabled={index === 0}
                                                    onClick={() =>
                                                        moveMethod(index, "up")
                                                    }
                                                >
                                                    <ArrowUp className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    disabled={
                                                        index ===
                                                        selectedMethods.length -
                                                            1
                                                    }
                                                    onClick={() =>
                                                        moveMethod(
                                                            index,
                                                            "down",
                                                        )
                                                    }
                                                >
                                                    <ArrowDown className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* STEP 3: CONFIGURATION (Combined) */}
                    {step === 3 && (
                        <div className="space-y-6">
                            {/* Watermark Config */}
                            {selectedMethods.includes("visual-watermark") && (
                                <div className="space-y-3">
                                    <Label className="text-xs font-semibold uppercase text-muted-foreground">
                                        Watermark Settings
                                    </Label>
                                    <div className="space-y-2">
                                        <Label htmlFor="watermark">
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
                                            This text will be tiled diagonally
                                            across the protected image. Max 25
                                            characters.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 4: CONFIRMATION */}
                    {step === 4 && (
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
                                            {selectedMethods.reduce((acc, m) => acc + (PROTECTION_PRICING[m]?.estimatedDuration || 0), 0) > 60 
                                                ? `${Math.ceil(selectedMethods.reduce((acc, m) => acc + (PROTECTION_PRICING[m]?.estimatedDuration || 0), 0) / 60)} minutes`
                                                : `${selectedMethods.reduce((acc, m) => acc + (PROTECTION_PRICING[m]?.estimatedDuration || 0), 0)} seconds`
                                            }
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
                                                You need <b>{eligibility.proposedCost.toFixed(2)}</b> credits for this job, but you only have <b>{eligibility.balance.toFixed(2)}</b> available (after checking active jobs).
                                            </p>
                                            <p className="text-xs text-red-600 mt-1">
                                                Please recharge <b>{eligibility.missing.toFixed(2)}</b> more credits to continue.
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
                                    Final Pipeline
                                </h4>
                                <div className="space-y-2">
                                    {selectedMethods.map((method, idx) => (
                                        <div
                                            key={method}
                                            className="flex items-center gap-2 text-sm"
                                        >
                                            <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1 flex justify-between items-center">
                                                <span>
                                                    {
                                                        PROTECTION_OPTIONS.find(
                                                            (o) =>
                                                                o.value === method,
                                                        )?.label
                                                    }
                                                    {method ===
                                                        ProtectionMethod.WATERMARK && (
                                                        <span className="text-muted-foreground ml-1">
                                                            ("{watermarkText}")
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="text-xs font-mono text-muted-foreground">
                                                    {PROTECTION_PRICING[method]?.cost.toFixed(2)} credits
                                                </span>
                                            </div>
                                            {idx <
                                                selectedMethods.length - 1 && (
                                                <ArrowDown className="h-3 w-3 text-muted-foreground/50 mx-1" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                    {step === 5 && (
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
                        step === 5
                            ? "justify-center sm:justify-center"
                            : "justify-end",
                    )}
                >
                    {step > 1 && step < 5 && (
                        <Button
                            variant="ghost"
                            onClick={handleBack}
                            disabled={isPending}
                        >
                            Back
                        </Button>
                    )}

                    {step < 4 ? (
                        <Button
                            onClick={handleNext}
                            disabled={selectedMethods.length === 0}
                        >
                            Next <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    ) : step === 4 ? (
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
