"use client";

import { useState, useTransition, useEffect } from "react";
import { usePostHog } from "posthog-js/react";
import { toast } from "react-hot-toast";
import { z } from "zod";
import {
    Loader2,
    ShieldCheck,
    AlertTriangle,
    Check,
    ArrowRight,
    ArrowLeft,
    Smartphone,
    UserX,
    Palette,
    Pencil,
    Fingerprint,
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
import { cn } from "@/lib/utils";
import { ProtectionMethod } from "@/modules/artworks/models/artwork.enum";
import { protectArtworkAction } from "../actions/protect-artwork.action";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { checkArtworkProtectionEligibility } from "../actions/check-eligibility.action";
import { useRouter } from "next/navigation";
import { usePWA } from "@/providers/pwa-provider";
import {
    PIPELINE_LAYERS,
    PIPELINE_GLOBAL_CONFIG,
    type ConfigFieldToggle,
} from "@/constants/pipeline-contract";

// Icon map: contract icon name → Lucide component
const LAYER_ICON_MAP: Record<
    string,
    React.ComponentType<{ className?: string }>
> = {
    UserX,
    Palette,
    Edit3: Pencil,
    Fingerprint,
};

interface ProtectArtworkDialogProps {
    artworkId: string;
    children?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

// Phases:
//   1 — Select Layers
//   2 — Configure (intensity + per-layer config fields)
//   3 — Review & Confirm (summary + cost + submit)
//   4 — Success
type Step = 1 | 2 | 3 | 4;

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
    const setOpen = (newOpen: boolean) => {
        if (isControlled) {
            controlledOnOpenChange?.(newOpen);
        } else {
            setInternalOpen(newOpen);
        }
    };

    const [step, setStep] = useState<Step>(1);
    const [watermarkText, setWatermarkText] = useState("DRIMIT");
    const [intensity, setIntensity] = useState<string>(
        PIPELINE_GLOBAL_CONFIG.intensity.default,
    );

    // Layer flags — driven by PIPELINE_LAYERS contract, no hardcoding
    // comingSoon layers always start as false and cannot be toggled
    const [layerFlags, setLayerFlags] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(
            PIPELINE_LAYERS.map((l) => [
                l.id,
                l.comingSoon ? false : l.defaultEnabled,
            ]),
        ),
    );
    const toggleLayer = (id: string) => {
        const layer = PIPELINE_LAYERS.find((l) => l.id === id);
        if (layer?.comingSoon) return;
        setLayerFlags((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    // Per-layer toggle config values (e.g. legacy proxy support)
    const [configValues, setConfigValues] = useState<Record<string, boolean>>(
        () =>
            Object.fromEntries(
                PIPELINE_LAYERS.flatMap((l) =>
                    l.configFields
                        .filter(
                            (f): f is ConfigFieldToggle => f.type === "toggle",
                        )
                        .map((f) => [f.key, f.defaultValue]),
                ),
            ),
    );

    const [isPending, startTransition] = useTransition();
    const { data: session } = authClient.useSession();

    const [eligibility, setEligibility] = useState<{
        eligible: boolean;
        missing: number;
        balance: number;
        proposedCost: number;
    } | null>(null);

    const getActiveLayers = () =>
        PIPELINE_LAYERS.filter((l) => layerFlags[l.id]).map((l) => l.layerKey);

    const activeLayers = PIPELINE_LAYERS.filter((l) => layerFlags[l.id]);
    const isWatermarkEnabled = layerFlags["layer_4_watermark"] ?? false;

    // Check eligibility whenever config changes — result is ready when user reaches step 3
    useEffect(() => {
        if (!open || !session?.user?.id) return;
        const timer = setTimeout(() => {
            startTransition(async () => {
                const pipeline = [
                    {
                        method: ProtectionMethod.SHIELD,
                        config: {
                            intensity,
                            watermark_text: watermarkText,
                            layers: getActiveLayers(),
                            ...configValues,
                        },
                    },
                ];
                const result = await checkArtworkProtectionEligibility(
                    session.user.id,
                    pipeline,
                );
                setEligibility(result);
            });
        }, 300);
        return () => clearTimeout(timer);
    }, [open, session, intensity, watermarkText, layerFlags]);

    // Reset on open
    useEffect(() => {
        if (open) {
            setStep(1);
            setWatermarkText("DRIMIT");
            setIntensity(PIPELINE_GLOBAL_CONFIG.intensity.default);
            setLayerFlags(
                Object.fromEntries(
                    PIPELINE_LAYERS.map((l) => [
                        l.id,
                        l.comingSoon ? false : l.defaultEnabled,
                    ]),
                ),
            );
            setConfigValues(
                Object.fromEntries(
                    PIPELINE_LAYERS.flatMap((l) =>
                        l.configFields
                            .filter(
                                (f): f is ConfigFieldToggle =>
                                    f.type === "toggle",
                            )
                            .map((f) => [f.key, f.defaultValue]),
                    ),
                ),
            );
            setEligibility(null);
            ph?.capture("protection_dialog_opened", { artwork_id: artworkId });
        }
    }, [open]);

    // Pre-fill watermark from session name
    useEffect(() => {
        if (session?.user?.name && watermarkText === "DRIMIT") {
            let sanitized = session.user.name.replace(
                /[^a-zA-Z0-9\sáéíóúÁÉÍÓÚñÑ.,!?-]/g,
                "",
            );
            sanitized = sanitized.replace(/\s+/g, " ").trim();
            if (sanitized) setWatermarkText(sanitized.substring(0, 25));
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
            if (activeLayers.length === 0) {
                toast.error("Select at least one protection layer.");
                return;
            }
            setStep(2);
        } else if (step === 2) {
            if (isWatermarkEnabled) {
                const result = watermarkSchema.safeParse(watermarkText);
                if (!result.success) {
                    toast.error(result.error.issues[0].message);
                    return;
                }
            }
            setStep(3);
        } else if (step === 3) {
            handleSubmit();
        }
    };

    const handleBack = () => {
        if (step === 2) setStep(1);
        else if (step === 3) setStep(2);
    };

    const handleSubmit = () => {
        startTransition(async () => {
            const pipeline = [
                {
                    method: ProtectionMethod.SHIELD,
                    config: {
                        intensity,
                        watermark_text: watermarkText.trim(),
                        layers: getActiveLayers(),
                        ...configValues,
                    },
                },
            ];
            const result = await protectArtworkAction({ artworkId, pipeline });
            if (result.success) {
                setStep(4);
                ph?.capture("protection_pipeline_queued", {
                    artwork_id: artworkId,
                });
                router.refresh();
            } else {
                toast.error(result.error || "Failed to start protection");
            }
        });
    };

    const handleClose = () => setOpen(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="flex flex-col sm:max-w-[460px] max-h-[90dvh] overflow-hidden">
                {step !== 4 ? (
                    <DialogHeader>
                        <DialogTitle>
                            {step === 1 && "Select Protections"}
                            {step === 2 && "Configure"}
                            {step === 3 && "Review & Confirm"}
                        </DialogTitle>
                        <DialogDescription>
                            {step === 1 &&
                                "Choose which protection layers to apply to your artwork."}
                            {step === 2 &&
                                "Customize settings for your selected protections."}
                            {step === 3 &&
                                "Review your configuration before starting the pipeline."}
                        </DialogDescription>
                    </DialogHeader>
                ) : (
                    <DialogTitle className="sr-only">
                        Protection Started
                    </DialogTitle>
                )}

                <div className="py-1 flex-1 min-h-0 overflow-y-auto">
                    {/* ── STEP 1: LAYER SELECTION ── */}
                    {step === 1 && (
                        <div className="space-y-2">
                            {PIPELINE_LAYERS.map((layer) => {
                                const Icon = LAYER_ICON_MAP[layer.icon];
                                const enabled = layerFlags[layer.id];
                                return (
                                    <button
                                        key={layer.id}
                                        type="button"
                                        disabled={!!layer.comingSoon}
                                        onClick={() => toggleLayer(layer.id)}
                                        className={cn(
                                            "w-full flex items-start gap-3 rounded-lg border p-3.5 text-left transition-all duration-150",
                                            layer.comingSoon
                                                ? "border-muted bg-muted/10 opacity-40 cursor-not-allowed"
                                                : enabled
                                                  ? "border-primary/40 bg-primary/5"
                                                  : "border-muted bg-muted/10 opacity-55",
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-colors",
                                                enabled && !layer.comingSoon
                                                    ? "bg-primary/10 text-primary"
                                                    : "bg-muted text-muted-foreground",
                                            )}
                                        >
                                            {Icon ? (
                                                <Icon className="h-4 w-4" />
                                            ) : null}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium">
                                                {layer.label}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                                {layer.uiDescription}
                                            </p>
                                        </div>
                                        {layer.comingSoon ? (
                                            <span className="mt-0.5 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                                                Soon
                                            </span>
                                        ) : (
                                            <Checkbox
                                                checked={enabled}
                                                className="mt-0.5 pointer-events-none flex-shrink-0"
                                                onCheckedChange={() => {}}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* ── STEP 2: CONFIGURATION ── */}
                    {step === 2 && (
                        <div className="space-y-5">
                            {/* Global: Intensity — only shown when adversarial layers are active */}
                            {activeLayers.some((l) => !l.comingSoon) && (
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold uppercase text-muted-foreground">
                                        Protection Intensity
                                    </Label>
                                    <Select
                                        value={intensity}
                                        onValueChange={setIntensity}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select intensity" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PIPELINE_GLOBAL_CONFIG.intensity.options.map(
                                                (opt) => (
                                                    <SelectItem
                                                        key={opt.value}
                                                        value={opt.value}
                                                    >
                                                        {opt.label}
                                                    </SelectItem>
                                                ),
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        {
                                            PIPELINE_GLOBAL_CONFIG.intensity
                                                .helpText
                                        }
                                    </p>
                                </div>
                            )}

                            {/* Per-layer config fields (contract-driven) */}
                            {activeLayers
                                .filter((l) => l.configFields.length > 0)
                                .map((layer) => {
                                    const LayerIcon =
                                        LAYER_ICON_MAP[layer.icon];
                                    return (
                                        <div
                                            key={layer.id}
                                            className="space-y-2"
                                        >
                                            {layer.configFields.map((field) => {
                                                if (field.type === "text") {
                                                    const value =
                                                        field.key ===
                                                        "watermark_text"
                                                            ? watermarkText
                                                            : "";
                                                    const handleChange =
                                                        field.key ===
                                                        "watermark_text"
                                                            ? (
                                                                  e: React.ChangeEvent<HTMLInputElement>,
                                                              ) =>
                                                                  setWatermarkText(
                                                                      e.target
                                                                          .value,
                                                                  )
                                                            : undefined;
                                                    return (
                                                        <div
                                                            key={field.key}
                                                            className="space-y-3 rounded-lg border p-3.5 bg-muted/10 animate-in fade-in slide-in-from-top-2 duration-200"
                                                        >
                                                            <p className="text-xs font-semibold uppercase text-muted-foreground">
                                                                {layer.label}
                                                            </p>
                                                            <div className="space-y-1.5">
                                                                <Label className="text-sm">
                                                                    {
                                                                        field.label
                                                                    }
                                                                </Label>
                                                                <Input
                                                                    value={
                                                                        value
                                                                    }
                                                                    onChange={
                                                                        handleChange
                                                                    }
                                                                    placeholder={
                                                                        field.placeholder
                                                                    }
                                                                    maxLength={
                                                                        field.maxLength
                                                                    }
                                                                />
                                                                {field.helpText && (
                                                                    <p className="text-xs text-muted-foreground">
                                                                        {
                                                                            field.helpText
                                                                        }
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                if (field.type === "toggle") {
                                                    const checked =
                                                        configValues[
                                                            field.key
                                                        ] ?? field.defaultValue;
                                                    return (
                                                        <button
                                                            key={field.key}
                                                            type="button"
                                                            onClick={() =>
                                                                setConfigValues(
                                                                    (prev) => ({
                                                                        ...prev,
                                                                        [field.key]:
                                                                            !prev[
                                                                                field
                                                                                    .key
                                                                            ],
                                                                    }),
                                                                )
                                                            }
                                                            className={cn(
                                                                "w-full flex items-start gap-3 rounded-lg border p-3.5 text-left transition-all duration-150 animate-in fade-in slide-in-from-top-2 duration-200",
                                                                checked
                                                                    ? "border-primary/40 bg-primary/5"
                                                                    : "border-muted bg-muted/10 opacity-55",
                                                            )}
                                                        >
                                                            <div
                                                                className={cn(
                                                                    "mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-colors",
                                                                    checked
                                                                        ? "bg-primary/10 text-primary"
                                                                        : "bg-muted text-muted-foreground",
                                                                )}
                                                            >
                                                                {LayerIcon ? (
                                                                    <LayerIcon className="h-4 w-4" />
                                                                ) : null}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium">
                                                                    {
                                                                        field.label
                                                                    }
                                                                </p>
                                                                {field.helpText && (
                                                                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                                                        {
                                                                            field.helpText
                                                                        }
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <Checkbox
                                                                checked={
                                                                    checked
                                                                }
                                                                className="mt-0.5 pointer-events-none flex-shrink-0"
                                                                onCheckedChange={() => {}}
                                                            />
                                                        </button>
                                                    );
                                                }
                                                return null;
                                            })}
                                        </div>
                                    );
                                })}

                            {/* If no per-layer config fields, explain */}
                            {activeLayers.every(
                                (l) => l.configFields.length === 0,
                            ) && (
                                <p className="text-sm text-muted-foreground text-center py-2">
                                    No additional configuration needed for the
                                    selected layers.
                                </p>
                            )}
                        </div>
                    )}

                    {/* ── STEP 3: REVIEW & CONFIRM ── */}
                    {step === 3 && (
                        <div className="space-y-3">
                            {/* Selected layers */}
                            <div className="rounded-lg border p-3.5 space-y-2">
                                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2.5">
                                    Active Protections ({activeLayers.length}/
                                    {PIPELINE_LAYERS.length})
                                </p>
                                {PIPELINE_LAYERS.map((layer) => {
                                    const enabled = layerFlags[layer.id];
                                    const Icon = LAYER_ICON_MAP[layer.icon];
                                    return (
                                        <div
                                            key={layer.id}
                                            className={cn(
                                                "flex items-center gap-2 text-sm",
                                                !enabled && "opacity-35",
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm",
                                                    enabled
                                                        ? "text-primary"
                                                        : "text-muted-foreground",
                                                )}
                                            >
                                                {enabled ? (
                                                    <Check className="h-3.5 w-3.5" />
                                                ) : (
                                                    <div className="h-px w-3 bg-muted-foreground/40" />
                                                )}
                                            </div>
                                            {Icon && (
                                                <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                                            )}
                                            <span
                                                className={
                                                    enabled ? "font-medium" : ""
                                                }
                                            >
                                                {layer.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Config summary */}
                            <div className="rounded-lg border p-3.5 space-y-1.5 text-sm">
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">
                                        Intensity
                                    </span>
                                    <span className="font-medium">
                                        {intensity}
                                    </span>
                                </div>
                                {isWatermarkEnabled && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">
                                            Watermark
                                        </span>
                                        <span className="font-medium font-mono text-xs truncate max-w-[160px]">
                                            {watermarkText}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Cost / Eligibility card */}
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                                {eligibility ? (
                                    !eligibility.eligible ? (
                                        <div className="rounded-md border border-red-200 bg-red-50 p-3 flex gap-3 items-start">
                                            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <p className="text-sm font-semibold text-red-700">
                                                    Insufficient Credits
                                                </p>
                                                <p className="text-xs text-red-600 mt-1">
                                                    Required:{" "}
                                                    <b>
                                                        {eligibility.proposedCost.toFixed(
                                                            2,
                                                        )}
                                                    </b>{" "}
                                                    · Available:{" "}
                                                    <b>
                                                        {eligibility.balance.toFixed(
                                                            2,
                                                        )}
                                                    </b>
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
                                                        Cost
                                                    </p>
                                                    <p className="text-lg font-bold leading-none text-blue-900">
                                                        {eligibility.proposedCost.toFixed(
                                                            2,
                                                        )}{" "}
                                                        Credits
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-blue-600">
                                                    Balance:{" "}
                                                    {eligibility.balance.toFixed(
                                                        2,
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div className="h-[74px] rounded-md border border-muted bg-muted/10 animate-pulse" />
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── STEP 4: SUCCESS ── */}
                    {step === 4 && (
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
                                                Install our app for faster
                                                access, notifications, and
                                                easier uploads.
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
                        step === 4
                            ? "justify-center sm:justify-center"
                            : "justify-between sm:justify-between",
                    )}
                >
                    {/* Left: Cancel (step 1) or Back (steps 2–3) */}
                    {step === 1 && (
                        <Button
                            variant="ghost"
                            onClick={handleClose}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                    )}
                    {(step === 2 || step === 3) && (
                        <Button
                            variant="ghost"
                            onClick={handleBack}
                            disabled={isPending}
                        >
                            <ArrowLeft className="mr-1 h-4 w-4" />
                            Back
                        </Button>
                    )}

                    {/* Right: Next / Review / Protect / Close */}
                    {step === 1 && (
                        <Button
                            onClick={handleNext}
                            disabled={activeLayers.length === 0}
                        >
                            Next
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    )}
                    {step === 2 && (
                        <Button onClick={handleNext}>
                            Review
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    )}
                    {step === 3 &&
                        (eligibility && !eligibility.eligible ? (
                            <Button
                                onClick={() => router.push("/billing")}
                                variant="destructive"
                            >
                                Recharge
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                onClick={handleNext}
                                disabled={isPending || !eligibility}
                            >
                                {isPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        Protect Artwork
                                        <ShieldCheck className="ml-2 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        ))}
                    {step === 4 && (
                        <Button
                            onClick={handleClose}
                            variant={
                                canInstall && !isInstalled ? "ghost" : "default"
                            }
                            className="min-w-[100px]"
                        >
                            {canInstall && !isInstalled
                                ? "Maybe Later"
                                : "Close"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
