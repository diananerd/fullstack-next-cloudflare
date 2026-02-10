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

interface ProtectArtworkDialogProps {
    artworkId: number;
    children?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

const PROTECTION_OPTIONS = [
    {
        value: ProtectionMethod.GRAYSCALE,
        label: "B&W Conversion",
        description: "Simple grayscale filter.",
        icon: Wand2,
        disabled: false,
    },
    {
        value: "ai-watermark",
        label: "AI Watermark",
        description: "Invisible watermark for provenance.",
        icon: Fingerprint,
        disabled: true,
    },
    {
        value: ProtectionMethod.MIST,
        label: "AI Poisoning",
        description: "Protects against AI mimicry (Style Transfer / LoRA).",
        icon: ShieldCheck,
        disabled: false,
    },
    {
        value: ProtectionMethod.WATERMARK,
        label: "Visible Watermark",
        description: "Overlays a visible custom text watermark.",
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
    const [internalOpen, setInternalOpen] = useState(false);
    
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
    const [selectedMethods, setSelectedMethods] = useState<
        ProtectionMethodType[]
    >([]);

    // Config States
    const [watermarkText, setWatermarkText] = useState("DRIMIT SHIELD");
    const [mistModel, setMistModel] = useState("mist-v2");

    const [isPending, startTransition] = useTransition();

    // Session for pre-filling watermark
    const { data: session } = authClient.useSession();

    useEffect(() => {
        if (open) {
            // Reset state on open to avoid pollution from previous runs
            setStep(1);
            setSelectedMethods([]);
            setMistModel("mist-v2");
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

    const toggleMethod = (method: ProtectionMethodType) => {
        if (selectedMethods.includes(method)) {
            setSelectedMethods(selectedMethods.filter((m) => m !== method));
        } else {
            // Respect default order when adding
            const newSelection = [...selectedMethods, method];
            // Sort based on PROTECTION_OPTIONS index
            newSelection.sort((a, b) => {
                const idxA = PROTECTION_OPTIONS.findIndex((o) => o.value === a);
                const idxB = PROTECTION_OPTIONS.findIndex((o) => o.value === b);
                return idxA - idxB;
            });
            setSelectedMethods(newSelection);
        }
    };

    const moveMethod = (index: number, direction: "up" | "down") => {
        const newMethods = [...selectedMethods];
        if (direction === "up" && index > 0) {
            [newMethods[index], newMethods[index - 1]] = [
                newMethods[index - 1],
                newMethods[index],
            ];
        } else if (direction === "down" && index < newMethods.length - 1) {
            [newMethods[index], newMethods[index + 1]] = [
                newMethods[index + 1],
                newMethods[index],
            ];
        }
        setSelectedMethods(newMethods);
    };

    const hasConfigStep =
        selectedMethods.includes(ProtectionMethod.WATERMARK) ||
        selectedMethods.includes(ProtectionMethod.MIST);

    const handleNext = () => {
        if (step === 1) {
            if (selectedMethods.length === 0) {
                toast.error("Please select at least one method.");
                return;
            }

            // Skip ordering step if only 1 method
            if (selectedMethods.length === 1) {
                if (hasConfigStep) setStep(3);
                else setStep(4);
            } else {
                setStep(2);
            }
        } else if (step === 2) {
            if (hasConfigStep) {
                setStep(3);
            } else {
                setStep(4);
            }
        } else if (step === 3) {
            if (selectedMethods.includes(ProtectionMethod.WATERMARK)) {
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
        if (step === 2) {
            setStep(1);
        } else if (step === 3) {
            // If we skipped step 2, go back to 1
            if (selectedMethods.length === 1) setStep(1);
            else setStep(2);
        } else if (step === 4) {
            if (hasConfigStep) {
                setStep(3);
            } else {
                // If no config, check if we skipped step 2
                if (selectedMethods.length === 1) setStep(1);
                else setStep(2);
            }
        }
    };

    const handleSubmit = () => {
        startTransition(async () => {
            const pipeline = selectedMethods.map((m) => {
                const config: Record<string, any> = {};
                if (m === ProtectionMethod.WATERMARK) {
                    config.text = watermarkText.trim();
                }
                if (m === ProtectionMethod.MIST) {
                    config.model = mistModel;
                }

                return {
                    method: m,
                    config: Object.keys(config).length > 0 ? config : undefined,
                };
            });

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
                                        option.value as ProtectionMethodType,
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
                                                    option.value as ProtectionMethodType,
                                                )
                                            }
                                        >
                                            <Checkbox
                                                checked={isSelected}
                                                onCheckedChange={() =>
                                                    toggleMethod(
                                                        option.value as ProtectionMethodType,
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
                            {/* AI Poisoning Config */}
                            {selectedMethods.includes(
                                ProtectionMethod.MIST,
                            ) && (
                                <div className="space-y-3">
                                    <Label className="text-xs font-semibold uppercase text-muted-foreground">
                                        AI Poisoning Strategy
                                    </Label>
                                    <div className="space-y-2">
                                        <Label
                                            htmlFor="model-select"
                                            className="text-sm"
                                        >
                                            Select Model
                                        </Label>
                                        <Select
                                            value={mistModel}
                                            onValueChange={setMistModel}
                                        >
                                            <SelectTrigger id="model-select">
                                                <SelectValue placeholder="Select a model" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="mist-v2">
                                                    Mist V2 (High Performance)
                                                </SelectItem>
                                                <SelectItem
                                                    value="glaze"
                                                    disabled
                                                >
                                                    Glaze (Coming Soon)
                                                </SelectItem>
                                                <SelectItem
                                                    value="nightshade"
                                                    disabled
                                                >
                                                    Nightshade (Coming Soon)
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            Current active model: Mist V2
                                            (Optimized for Style Transfer
                                            protection).
                                        </p>
                                    </div>
                                </div>
                            )}

                            {selectedMethods.includes(ProtectionMethod.MIST) &&
                                selectedMethods.includes(
                                    ProtectionMethod.WATERMARK,
                                ) && <div className="h-px bg-border" />}

                            {/* Watermark Config */}
                            {selectedMethods.includes(
                                ProtectionMethod.WATERMARK,
                            ) && (
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
                            <div className="space-y-1">
                                <p className="text-sm font-medium">
                                    Ready to protect?
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    This process runs in the background. It
                                    takes about{" "}
                                    <span className="font-semibold text-foreground">
                                        15 minutes
                                    </span>
                                    . You can close this window safely.
                                </p>
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
                                                {method ===
                                                    ProtectionMethod.MIST && (
                                                    <span className="text-muted-foreground ml-1">
                                                        ({mistModel})
                                                    </span>
                                                )}
                                            </span>
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
                                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                                    Your artwork is now being processed by our
                                    secure pipeline. You can safely close this
                                    window.
                                </p>
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
                        <Button onClick={handleSubmit} disabled={isPending}>
                            {isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Start Protection
                            <Sparkles className="ml-2 h-4 w-4" />
                        </Button>
                    ) : (
                        <Button onClick={handleClose} className="min-w-[100px]">
                            Close
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
