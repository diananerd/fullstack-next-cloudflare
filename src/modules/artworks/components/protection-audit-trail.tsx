"use client";

import {
    Activity,
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    Clock,
    Loader2,
    ShieldAlert,
    XCircle,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ProtectionJobResult, StepResult } from "../models/protection-result.model";
import { PIPELINE_LAYERS } from "@/constants/pipeline-contract";
import type { VerificationMetricConfig } from "@/constants/pipeline-contract";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";

interface ProtectionAuditTrailProps {
    jobResult?: ProtectionJobResult;
    status: string;
    statusDate?: string;
    className?: string;
    r2BaseUrl?: string;
    /** Currently active variant in the main image viewer */
    selectedVariant?: string;
    /** Called when user wants to preview a layer's artifact */
    onSelectVariant?: (variant: string) => void;
}

// Maps layerKey → variant key used in the main image switcher
const LAYER_VARIANT: Record<string, string> = {
    identity: "identity",
    mimicry: "mimicry",
    editing: "editing",
    watermark: "watermark",
};

function getInterpretation(
    layerKey: string,
    status: string | undefined,
    meta: Record<string, unknown>,
): { headline: string; detail: string; isGood: boolean } {
    if (!status || status === "PENDING") {
        return { headline: "Not yet verified", detail: "This layer hasn't run yet.", isGood: false };
    }
    if (status === "ERROR") {
        return {
            headline: "Verification could not complete",
            detail: "The protection was applied, but the result check failed (network error during test). Protection is still active.",
            isGood: false,
        };
    }

    switch (layerKey) {
        case "identity": {
            const faces = meta?.faces_detected as number ?? -1;
            const drop = meta?.confidence_drop as number ?? 0;
            if (status === "PASS") return {
                headline: faces === 0
                    ? "Face recognition blocked successfully"
                    : `Detection confidence dropped ${(drop * 100).toFixed(0)}%`,
                detail: "AI tools can no longer reliably identify or scrape the faces in your artwork.",
                isGood: true,
            };
            return {
                headline: "Faces may still be detectable",
                detail: "AI might still identify faces. Consider re-processing at a higher intensity.",
                isGood: false,
            };
        }
        case "mimicry": {
            const sim = meta?.style_similarity as number | undefined;
            const drift = meta?.flux_vae_latent_drift as number | undefined;
            if (status === "PASS") return {
                headline: "Style successfully poisoned",
                detail: sim !== undefined
                    ? `Style similarity reduced to ${(sim * 100).toFixed(0)}%. Any AI model trained on this image will learn corrupted style data and produce degraded imitations.`
                    : "AI models trained on this image will learn a corrupted style and produce degraded imitations.",
                isGood: true,
            };
            return {
                headline: "Style may still be imitable",
                detail: "The poisoning may not be strong enough at the current intensity setting.",
                isGood: false,
            };
        }
        case "editing": {
            const artif = meta?.artifacts_metric as number | undefined;
            const flux = meta?.flux_latent_disruption as number | undefined;
            if (status === "PASS") return {
                headline: "AI editing is disrupted",
                detail: artif !== undefined
                    ? `Inpainting artifact score: ${artif.toFixed(0)} — AI editors produce garbled output on this image. Compare the two editing test previews to see the difference.`
                    : "When AI tries to edit or inpaint this image, it produces degraded results.",
                isGood: true,
            };
            return {
                headline: "AI editing may still work normally",
                detail: "Editing disruption is below target. Consider higher intensity.",
                isGood: false,
            };
        }
        case "watermark": {
            const detected = meta?.watermark_detected as boolean | undefined;
            const score = meta?.robustness_score as number | undefined;
            if (status === "PASS" && detected) return {
                headline: "Invisible watermark embedded",
                detail: score !== undefined
                    ? `Survives ${(score * 100).toFixed(0)}% of attack scenarios tested. The watermark links this image to your identity even after posting online.`
                    : "The invisible mark links this image to your account. Survives most social media processing.",
                isGood: true,
            };
            return {
                headline: "Watermark not detected",
                detail: "The watermark could not be verified. Re-run protection or check the watermark text setting.",
                isGood: false,
            };
        }
    }
    return { headline: "Status unknown", detail: "", isGood: false };
}

export function ProtectionAuditTrail({
    jobResult,
    status,
    statusDate,
    className,
    r2BaseUrl,
    selectedVariant,
    onSelectVariant,
}: ProtectionAuditTrailProps) {
    const firstLayerId = PIPELINE_LAYERS[0].id;
    const [openLayerId, setOpenLayerId] = useState<string>(firstLayerId);

    const toggleLayer = (id: string) => {
        setOpenLayerId((prev) => (prev === id ? firstLayerId : id));
    };

    const getStepResult = (stepKey: string): StepResult | undefined =>
        jobResult?.steps?.find((s) => s.step_name === stepKey);

    const formatValue = (value: unknown, metric: VerificationMetricConfig): string => {
        switch (metric.format) {
            case "percent": return `${((value as number) * 100).toFixed(1)}%`;
            case "decimal": return (value as number).toFixed(3);
            case "boolean": return value ? "YES" : "NO";
            case "count": return value === -1 ? "N/A" : String(value);
            default: return String(value);
        }
    };

    const isGoodValue = (value: unknown, metric: VerificationMetricConfig): boolean => {
        switch (metric.goodWhen) {
            case "zero": return value === 0;
            case "nonzero": return !!value;
            case "low": return typeof value === "number" && value < (metric.threshold ?? 0.5);
            case "high": return typeof value === "number" && value > (metric.threshold ?? 0.5);
            default: return true;
        }
    };

    const renderVerificationDetails = (layerId: string, result: StepResult | undefined) => {
        if (!result || result.status === "PENDING") return null;
        const layer = PIPELINE_LAYERS.find((l) => l.id === layerId);
        if (!layer) return null;
        const meta = (result.verification_meta || {}) as Record<string, unknown>;

        const v3Entries = ([meta.latest, meta.legacy] as Array<Record<string, unknown> | undefined>).filter(
            (e): e is Record<string, unknown> =>
                !!e && typeof e === "object" && ("baseline" in e || "baseline_self_similarity" in e),
        );

        const hasAnyMetric = layer.verificationMetrics.some(
            (m) => m.format !== "code" && meta[m.key] !== undefined && meta[m.key] !== null,
        );

        if (!hasAnyMetric && v3Entries.length === 0) return null;

        return (
            <div className="mt-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Technical Metrics</p>

                {layer.verificationMetrics.map((metric) => {
                    const value = meta[metric.key];
                    if (metric.format === "code") {
                        if (!value) return null;
                        return (
                            <div key={metric.key} className="mt-1 bg-zinc-800/60 p-1.5 rounded">
                                <span className="text-[10px] text-zinc-500 block mb-0.5">{metric.label}</span>
                                <code className="text-[10px] break-all block leading-tight text-zinc-300">{String(value)}</code>
                            </div>
                        );
                    }
                    if (value === undefined || value === null) return null;
                    const good = isGoodValue(value, metric);
                    return (
                        <div key={metric.key} className="flex justify-between items-center text-xs mt-1 bg-zinc-800/60 p-1.5 rounded">
                            <span className="text-zinc-500">{metric.label}</span>
                            <span className={cn("font-mono font-medium", good ? "text-emerald-400" : "text-yellow-400")}>
                                {formatValue(value, metric)}
                            </span>
                        </div>
                    );
                })}

                {/* v3: Before / After comparison table */}
                {v3Entries.length > 0 && (
                    <div className="mt-3 border-t border-zinc-700/50 pt-2">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1.5">Before / After Comparison</p>
                        <table className="w-full text-[10px]">
                            <thead>
                                <tr className="text-zinc-500">
                                    <th className="text-left font-normal pb-1">Model</th>
                                    <th className="text-right font-normal pb-1">Before</th>
                                    <th className="text-right font-normal pb-1">After</th>
                                    <th className="text-right font-normal pb-1">Delta</th>
                                </tr>
                            </thead>
                            <tbody>
                                {v3Entries.map((entry) => {
                                    const before = (entry.baseline as Record<string, number> | undefined)?.confidence ??
                                        (entry.baseline_self_similarity as number) ?? 0;
                                    const after = (entry.protected as Record<string, number> | undefined)?.confidence ??
                                        (entry.protected_similarity as number) ?? 0;
                                    const drop = (entry.confidence_drop as number) ?? (entry.drift as number) ?? (before - after);
                                    const isGood = drop > 0.3;
                                    return (
                                        <tr key={entry.model as string} className="border-t border-zinc-700/30">
                                            <td className="py-0.5 font-mono text-[9px] text-zinc-500">{entry.model as string}</td>
                                            <td className="text-right font-mono text-zinc-300">{(before * 100).toFixed(1)}%</td>
                                            <td className="text-right font-mono text-zinc-300">{(after * 100).toFixed(1)}%</td>
                                            <td className={cn("text-right font-mono", isGood ? "text-emerald-400" : "text-yellow-400")}>
                                                ↓ {(drop * 100).toFixed(1)}%
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* v3: Layer 4 robustness breakdown */}
                {layerId === "layer_4_watermark" && (meta.jpeg_80 as unknown) !== undefined && (
                    <div className="mt-3 border-t border-zinc-700/50 pt-2">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1.5">Robustness Tests</p>
                        <div className="space-y-0.5">
                            {(
                                [
                                    { label: "Direct decode", data: meta.direct },
                                    { label: "JPEG q80", data: meta.jpeg_80 },
                                    { label: "JPEG q60", data: meta.jpeg_60 },
                                    { label: "VAE encode-decode", data: meta.vae_pass },
                                    { label: "Bilateral filter", data: meta.bilateral },
                                ] as { label: string; data?: { detected?: boolean; match?: boolean } }[]
                            )
                                .filter((item) => item.data)
                                .map((item) => (
                                    <div key={item.label} className="flex justify-between text-[10px] py-0.5">
                                        <span className="text-zinc-500">{item.label}</span>
                                        <span className={cn("font-mono",
                                            item.data?.match ? "text-emerald-400" :
                                            item.data?.detected ? "text-yellow-400" : "text-zinc-600"
                                        )}>
                                            {item.data?.match ? "✓ match" : item.data?.detected ? "detected, no match" : "not found"}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const isCompleted = status === "completed" || status === "done";
    const isFailed = status === "failed";
    const isProcessing = status === "processing" || status === "queued";

    return (
        <div className={cn("h-full flex flex-col overflow-hidden bg-zinc-950", className)}>
            {/* Header */}
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between shrink-0">
                <div>
                    <div className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-zinc-300">
                        <Activity className="w-3.5 h-3.5 text-emerald-500" />
                        Protection Audit Log
                    </div>
                    <div className="text-[10px] mt-0.5 flex items-center gap-1.5 text-zinc-500">
                        {statusDate && (
                            <span suppressHydrationWarning>
                                {formatDistanceToNow(new Date(statusDate), { addSuffix: true })}
                            </span>
                        )}
                        {jobResult?.total_duration_ms && (
                            <span>• {(jobResult.total_duration_ms / 1000).toFixed(1)}s total</span>
                        )}
                        {isProcessing && <span>• Running…</span>}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {isCompleted && jobResult?.shieldScore !== undefined && (
                        <div className="text-right">
                            <div className="text-[9px] text-zinc-500 uppercase tracking-wider">Shield</div>
                            <div className={cn("text-lg font-bold font-mono leading-none",
                                jobResult.shieldScore >= 90 ? "text-emerald-400" :
                                jobResult.shieldScore >= 70 ? "text-yellow-400" : "text-red-400"
                            )}>
                                {jobResult.shieldScore.toFixed(0)}
                            </div>
                        </div>
                    )}
                    {isCompleted && <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" /> Certified</Badge>}
                    {isFailed && <Badge variant="destructive" className="text-[10px]"><ShieldAlert className="w-3 h-3 mr-1" /> Failed</Badge>}
                    {isProcessing && <Badge variant="secondary" className="animate-pulse text-[10px] bg-blue-900/30 text-blue-400 border-blue-700/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Active</Badge>}
                </div>
            </div>

            {/* Accordion list */}
            <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                    {PIPELINE_LAYERS.map((layer, idx) => {
                        const result = getStepResult(layer.id);
                        const stepStatus = result?.status || "PENDING";
                        const isOpen = openLayerId === layer.id;
                        const meta = (result?.verification_meta || {}) as Record<string, unknown>;
                        const interp = getInterpretation(layer.layerKey, stepStatus, meta);
                        const variantKey = LAYER_VARIANT[layer.layerKey];
                        const isActiveVariant = !!variantKey && (
                            selectedVariant === variantKey ||
                            (layer.layerKey === "editing" && (selectedVariant === "editing" || selectedVariant === "editing_orig"))
                        );

                        // Icon + colors based on status
                        let statusIcon = <Clock className="w-3.5 h-3.5 text-zinc-500" />;
                        let statusColor = "text-zinc-500";
                        let dotColor = "bg-zinc-600";
                        let borderColor = "border-zinc-700/50";

                        if (stepStatus === "PASS") {
                            statusIcon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
                            statusColor = "text-emerald-400";
                            dotColor = "bg-emerald-500";
                            borderColor = "border-emerald-700/40";
                        } else if (stepStatus === "FAIL") {
                            statusIcon = <XCircle className="w-3.5 h-3.5 text-red-400" />;
                            statusColor = "text-red-400";
                            dotColor = "bg-red-500";
                            borderColor = "border-red-800/40";
                        } else if (stepStatus === "ERROR") {
                            statusIcon = <AlertCircle className="w-3.5 h-3.5 text-orange-400" />;
                            statusColor = "text-orange-400";
                            dotColor = "bg-orange-500";
                            borderColor = "border-orange-800/40";
                        } else if (stepStatus === "PROCESSING") {
                            statusIcon = <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
                            statusColor = "text-blue-400";
                            dotColor = "bg-blue-500 animate-pulse";
                            borderColor = "border-blue-700/40";
                        }

                        return (
                            <div
                                key={layer.id}
                                className={cn(
                                    "rounded-lg border transition-all duration-200 overflow-hidden",
                                    isActiveVariant ? "border-emerald-600/40 bg-zinc-900" : cn("bg-zinc-900/60", borderColor),
                                )}
                            >
                                {/* Accordion Header */}
                                <button
                                    type="button"
                                    onClick={() => toggleLayer(layer.id)}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-800/50 transition-colors"
                                >
                                    {/* Layer number dot */}
                                    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor)} />

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] text-zinc-600 font-medium">L{idx + 1}</span>
                                            <span className="text-xs font-medium text-zinc-200 truncate">{layer.label}</span>
                                            {isActiveVariant && (
                                                <span className="text-[9px] text-emerald-500 font-medium">● preview</span>
                                            )}
                                        </div>
                                        {/* Interpretation headline — visible even when collapsed */}
                                        {result && stepStatus !== "PENDING" && (
                                            <p className={cn("text-[10px] mt-0.5 truncate", interp.isGood ? "text-emerald-400/80" : statusColor)}>
                                                {interp.headline}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {statusIcon}
                                        <ChevronDown className={cn("w-3 h-3 text-zinc-600 transition-transform", isOpen && "rotate-180")} />
                                    </div>
                                </button>

                                {/* Expanded Content */}
                                {isOpen && (
                                    <div className="px-3 pb-3 border-t border-zinc-800/60">
                                        {/* Description */}
                                        <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">{layer.description}</p>

                                        {/* Interpretation — full detail */}
                                        {result && stepStatus !== "PENDING" && (
                                            <div className={cn(
                                                "mt-2 p-2 rounded-md text-[11px] leading-snug",
                                                interp.isGood ? "bg-emerald-950/40 border border-emerald-700/30 text-emerald-300" :
                                                stepStatus === "ERROR" ? "bg-orange-950/30 border border-orange-700/30 text-orange-300" :
                                                "bg-yellow-950/30 border border-yellow-700/30 text-yellow-300"
                                            )}>
                                                {interp.detail}
                                            </div>
                                        )}

                                        {/* Technical metrics */}
                                        {renderVerificationDetails(layer.id, result)}

                                        {/* Errors */}
                                        {result?.error && (
                                            <div className="mt-2 text-[10px] bg-red-950/40 text-red-400 p-2 rounded border border-red-800/30 flex items-start gap-2">
                                                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                                <span className="break-all">{result.error}</span>
                                            </div>
                                        )}
                                        {!result?.error && !!meta?.error && (
                                            <div className="mt-2 text-[10px] bg-orange-950/30 text-orange-400 p-2 rounded border border-orange-800/30 flex items-start gap-2">
                                                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                                <span className="break-all">{String(meta.error)}</span>
                                            </div>
                                        )}

                                        {/* Footer: duration + preview buttons */}
                                        <div className="mt-3 pt-2 border-t border-zinc-800/60 flex items-center justify-between gap-2">
                                            <span className="text-[10px] text-zinc-600">
                                                {result?.duration_ms !== undefined
                                                    ? `⏱ ${(result.duration_ms / 1000).toFixed(1)}s`
                                                    : ""}
                                            </span>

                                            {/* Preview variant buttons */}
                                            {result?.r2_key && onSelectVariant && (
                                                <div className="flex gap-1.5">
                                                    {layer.layerKey === "editing" ? (
                                                        <>
                                                            {result.r2_key && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onSelectVariant("editing")}
                                                                    className={cn(
                                                                        "text-[10px] px-2 py-0.5 rounded-full border transition-all",
                                                                        selectedVariant === "editing"
                                                                            ? "bg-emerald-600 border-emerald-600 text-white"
                                                                            : "border-zinc-700 text-zinc-400 hover:border-emerald-600 hover:text-emerald-400",
                                                                    )}
                                                                >
                                                                    Protected
                                                                </button>
                                                            )}
                                                            {result.r2_key_original && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onSelectVariant("editing_orig")}
                                                                    className={cn(
                                                                        "text-[10px] px-2 py-0.5 rounded-full border transition-all",
                                                                        selectedVariant === "editing_orig"
                                                                            ? "bg-zinc-500 border-zinc-500 text-white"
                                                                            : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300",
                                                                    )}
                                                                >
                                                                    Original
                                                                </button>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => onSelectVariant(variantKey)}
                                                            className={cn(
                                                                "text-[10px] px-2 py-0.5 rounded-full border transition-all",
                                                                selectedVariant === variantKey
                                                                    ? "bg-emerald-600 border-emerald-600 text-white"
                                                                    : "border-zinc-700 text-zinc-400 hover:border-emerald-600 hover:text-emerald-400",
                                                            )}
                                                        >
                                                            Preview
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

            </ScrollArea>
        </div>
    );
}
