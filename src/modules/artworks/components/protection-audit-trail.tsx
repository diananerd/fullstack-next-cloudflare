"use client";

import {
    Activity,
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    Clock,
    Copy,
    Loader2,
    MinusCircle,
    Shield,
    ShieldAlert,
    XCircle,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type {
    ProtectionJobResult,
    StepResult,
} from "../models/protection-result.model";
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
        return {
            headline: "Not yet verified",
            detail: "This layer hasn't run yet.",
            isGood: false,
        };
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
            const faces = (meta?.faces_detected as number) ?? -1;
            const drop = (meta?.confidence_drop as number) ?? 0;
            if (status === "PASS")
                return {
                    headline:
                        faces === 0
                            ? "Identity extraction blocked"
                            : `Face embedding confidence dropped ${(drop * 100).toFixed(0)}%`,
                    detail: "AI tools can no longer use your face/character as a reference to generate identity variations (IP-Adapter, InstantID, character LoRA).",
                    isGood: true,
                };
            return {
                headline: "Face embedding still extractable",
                detail: "Attackers may still use your face as an IP-Adapter reference to generate variations of you. Consider re-processing at a higher intensity.",
                isGood: false,
            };
        }
        case "mimicry": {
            const sim = meta?.style_similarity as number | undefined;
            if (status === "PASS")
                return {
                    headline: "Style successfully poisoned",
                    detail:
                        sim !== undefined
                            ? `CLIP style similarity: ${(sim * 100).toFixed(0)}%. LoRA/DreamBooth trained on this image will produce visually inconsistent imitations — it can't learn your style.`
                            : "LoRA/DreamBooth trained on this image will produce degraded style imitations with different compositions.",
                    isGood: true,
                };
            return {
                headline: "Style may still be learnable",
                detail: "LoRA training on this image might still capture your style. Consider re-processing at a higher intensity.",
                isGood: false,
            };
        }
        case "editing": {
            const flux = meta?.flux_latent_disruption as number | undefined;
            if (status === "PASS")
                return {
                    headline: "AI content editing disrupted",
                    detail:
                        flux !== undefined
                            ? `FLUX VAE latent disruption: ${flux.toFixed(3)} — ComfyUI and GPT-4o-style edits (outfit changes, background swaps, attribute modifications) produce incoherent output.`
                            : "AI tools that try to edit the image content (change clothing, background, attributes) will produce garbled, incoherent results.",
                    isGood: true,
                };
            return {
                headline: "AI content editing may still work",
                detail: "Editing disruption is below target. ComfyUI or GPT-4o could still change outfits, backgrounds, or attributes. Consider higher intensity.",
                isGood: false,
            };
        }
        case "watermark": {
            const detected = meta?.watermark_detected as boolean | undefined;
            const score = meta?.robustness_score as number | undefined;
            if (status === "PASS" && detected)
                return {
                    headline: "Invisible watermark embedded",
                    detail:
                        score !== undefined
                            ? `Survives ${(score * 100).toFixed(0)}% of stripping attacks (JPEG compression, bilateral filter, VAE encode-decode). Your authorship is encoded in the image even after re-posting.`
                            : "Your authorship identity is invisibly encoded in the image. Survives most social media processing and watermark stripping attempts.",
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
    const [openLayerId, setOpenLayerId] = useState<string | null>("summary");
    const [copied, setCopied] = useState(false);

    // Extract art type detected at pipeline start (stored in each step's meta)
    const detectedArtType = jobResult?.steps?.find(
        (s) => s.verification_meta?.art_type,
    )?.verification_meta?.art_type as string | undefined;
    const formatArtType = (t: string) =>
        t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    const toggleLayer = (id: string) => {
        setOpenLayerId((prev) => (prev === id ? null : id));
    };

    const getStepResult = (stepKey: string): StepResult | undefined =>
        jobResult?.steps?.find((s) => s.step_name === stepKey);

    const formatValue = (
        value: unknown,
        metric: VerificationMetricConfig,
    ): string => {
        switch (metric.format) {
            case "percent":
                return `${((value as number) * 100).toFixed(1)}%`;
            case "decimal":
                return (value as number).toFixed(3);
            case "boolean":
                return value ? "YES" : "NO";
            case "count":
                return value === -1 ? "N/A" : String(value);
            default:
                return String(value);
        }
    };

    const isGoodValue = (
        value: unknown,
        metric: VerificationMetricConfig,
    ): boolean => {
        switch (metric.goodWhen) {
            case "zero":
                return value === 0;
            case "nonzero":
                return !!value;
            case "low":
                return (
                    typeof value === "number" &&
                    value < (metric.threshold ?? 0.5)
                );
            case "high":
                return (
                    typeof value === "number" &&
                    value > (metric.threshold ?? 0.5)
                );
            default:
                return true;
        }
    };

    const renderVerificationDetails = (
        layerId: string,
        result: StepResult | undefined,
    ) => {
        if (!result || result.status === "PENDING") return null;
        const layer = PIPELINE_LAYERS.find((l) => l.id === layerId);
        if (!layer) return null;
        const meta = (result.verification_meta || {}) as Record<
            string,
            unknown
        >;

        // v3 format: collect latest + legacy model entries that have comparison data.
        // "baseline" covers L1 (face confidence comparison).
        // "baseline_self_similarity" covers L2 latest (CLIP self-sim starts at 1.0).
        // "drift" covers L2 legacy (clip-vit-l14 only returns protected_similarity + drift).
        const v3Entries = (
            [meta.latest, meta.legacy] as Array<
                Record<string, unknown> | undefined
            >
        ).filter(
            (e): e is Record<string, unknown> =>
                !!e &&
                typeof e === "object" &&
                ("baseline" in e ||
                    "baseline_self_similarity" in e ||
                    "drift" in e),
        );

        const hasAnyMetric = layer.verificationMetrics.some(
            (m) =>
                m.format !== "code" &&
                meta[m.key] !== undefined &&
                meta[m.key] !== null,
        );

        if (!hasAnyMetric && v3Entries.length === 0) return null;

        return (
            <div className="mt-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">
                    Technical Metrics
                </p>

                {layer.verificationMetrics.map((metric) => {
                    const value = meta[metric.key];
                    if (metric.format === "code") {
                        if (!value) return null;
                        return (
                            <div
                                key={metric.key}
                                className="mt-1 bg-zinc-800/60 p-1.5 rounded"
                            >
                                <span className="text-[10px] text-zinc-500 block mb-0.5">
                                    {metric.label}
                                </span>
                                <code className="text-[10px] break-all block leading-tight text-zinc-300">
                                    {String(value)}
                                </code>
                            </div>
                        );
                    }
                    if (value === undefined || value === null) return null;
                    const good = isGoodValue(value, metric);
                    return (
                        <div
                            key={metric.key}
                            className="flex justify-between items-center text-xs mt-1 bg-zinc-800/60 p-1.5 rounded"
                        >
                            <span className="text-zinc-500">
                                {metric.label}
                            </span>
                            <span
                                className={cn(
                                    "font-mono font-medium",
                                    good
                                        ? "text-emerald-400"
                                        : "text-yellow-400",
                                )}
                            >
                                {formatValue(value, metric)}
                            </span>
                        </div>
                    );
                })}

                {/* v3: Before / After comparison table */}
                {v3Entries.length > 0 && (
                    <div className="mt-3 border-t border-zinc-700/50 pt-2">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1.5">
                            Before / After Comparison
                        </p>
                        <table className="w-full text-[10px]">
                            <thead>
                                <tr className="text-zinc-500">
                                    <th className="text-left font-normal pb-1">
                                        Model
                                    </th>
                                    <th className="text-right font-normal pb-1">
                                        Before
                                    </th>
                                    <th className="text-right font-normal pb-1">
                                        After
                                    </th>
                                    <th className="text-right font-normal pb-1">
                                        Delta
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {v3Entries.map((entry) => {
                                    const before =
                                        (
                                            entry.baseline as
                                                | Record<string, number>
                                                | undefined
                                        )?.confidence ??
                                        (entry.baseline_self_similarity as number) ??
                                        // Style entries: self-similarity with
                                        // original is always 1.0
                                        ("drift" in entry ? 1.0 : 0);
                                    const after =
                                        (
                                            entry.protected as
                                                | Record<string, number>
                                                | undefined
                                        )?.confidence ??
                                        (entry.protected_similarity as number) ??
                                        0;
                                    const drop =
                                        (entry.confidence_drop as number) ??
                                        (entry.drift as number) ??
                                        before - after;
                                    const isGood = drop > 0.3;
                                    return (
                                        <tr
                                            key={entry.model as string}
                                            className="border-t border-zinc-700/30"
                                        >
                                            <td className="py-0.5 font-mono text-[9px] text-zinc-500">
                                                {entry.model as string}
                                            </td>
                                            <td className="text-right font-mono text-zinc-300">
                                                {(before * 100).toFixed(1)}%
                                            </td>
                                            <td className="text-right font-mono text-zinc-300">
                                                {(after * 100).toFixed(1)}%
                                            </td>
                                            <td
                                                className={cn(
                                                    "text-right font-mono",
                                                    isGood
                                                        ? "text-emerald-400"
                                                        : "text-yellow-400",
                                                )}
                                            >
                                                ↓ {(drop * 100).toFixed(1)}%
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* v4: Attack simulation details — per-layer */}
                {(meta.attack_method !== undefined ||
                    meta.attack_model !== undefined ||
                    meta.attack_prompt !== undefined ||
                    meta.edit_instruction !== undefined ||
                    meta.generation_prompt !== undefined ||
                    (layerId === "layer_3_editing" &&
                        (meta.kontext !== undefined ||
                            meta.flux_vae_proxy !== undefined)) ||
                    (layerId === "layer_1_identity" &&
                        (meta.latest as Record<string, unknown> | undefined)
                            ?.baseline !== undefined)) && (
                    <div className="mt-3 border-t border-zinc-700/50 pt-2">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1.5">
                            Attack Details
                        </p>

                        {/* Misuse scenarios (2-3 per layer) */}
                        {Array.isArray(meta.misuse_cases) && (meta.misuse_cases as string[]).length > 0 && (
                            <div className="mb-2">
                                <p className="text-[9px] uppercase tracking-wide text-zinc-600 font-medium mb-1">Simulated misuse scenarios</p>
                                <ul className="space-y-0.5">
                                    {(meta.misuse_cases as string[]).map((c, i) => (
                                        <li key={i} className="flex items-start gap-1.5 text-[10px] text-zinc-400">
                                            <span className="text-zinc-600 shrink-0 mt-px">→</span>
                                            <span>{c}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* L1 — Identity attack details */}
                        {layerId === "layer_1_identity" && (
                            <div className="space-y-0.5">
                                {!!meta.attack_method && (
                                    <div className="flex justify-between items-start text-[10px] py-0.5">
                                        <span className="text-zinc-500 shrink-0 mr-2">
                                            Method
                                        </span>
                                        <span className="font-mono text-zinc-300 text-right leading-tight">
                                            {meta.attack_method as string}
                                        </span>
                                    </div>
                                )}
                                {!!meta.generation_prompt && (
                                    <div className="mt-1">
                                        <p className="text-[10px] text-zinc-500 mb-0.5">
                                            Portrait generation prompt
                                        </p>
                                        <div className="bg-zinc-800/60 p-1.5 rounded">
                                            <code className="text-[10px] text-zinc-300 block leading-tight break-words whitespace-pre-wrap">
                                                &quot;
                                                {meta.generation_prompt as string}
                                                &quot;
                                            </code>
                                        </div>
                                    </div>
                                )}
                                {(meta.latest as any)?.baseline
                                    ?.faces_detected !== undefined && (
                                    <div className="flex justify-between text-[10px] py-0.5">
                                        <span className="text-zinc-500">
                                            antelopev2 faces before → after
                                        </span>
                                        <span className="font-mono text-zinc-300">
                                            {
                                                (meta.latest as any).baseline
                                                    .faces_detected
                                            }{" "}
                                            →{" "}
                                            {
                                                (meta.latest as any).protected
                                                    .faces_detected
                                            }
                                        </span>
                                    </div>
                                )}
                                {(meta.legacy as any)?.baseline
                                    ?.faces_detected !== undefined && (
                                    <div className="flex justify-between text-[10px] py-0.5">
                                        <span className="text-zinc-500">
                                            buffalo_l faces before → after
                                        </span>
                                        <span className="font-mono text-zinc-300">
                                            {
                                                (meta.legacy as any).baseline
                                                    .faces_detected
                                            }{" "}
                                            →{" "}
                                            {
                                                (meta.legacy as any).protected
                                                    .faces_detected
                                            }
                                        </span>
                                    </div>
                                )}
                                {(meta.latest as any)?.landmark_quality_drop !==
                                    undefined && (
                                    <div className="flex justify-between text-[10px] py-0.5">
                                        <span className="text-zinc-500">
                                            3D landmark quality drop
                                        </span>
                                        <span
                                            className={cn(
                                                "font-mono",
                                                (meta.latest as any)
                                                    .landmark_quality_drop > 0
                                                    ? "text-emerald-400"
                                                    : "text-yellow-400",
                                            )}
                                        >
                                            ↓{" "}
                                            {(
                                                (meta.latest as any)
                                                    .landmark_quality_drop as number
                                            ).toFixed(3)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* L2 — Style imitation attack details */}
                        {layerId === "layer_2_mimicry" && (
                            <div className="space-y-0.5">
                                {!!meta.attack_model && (
                                    <div className="flex justify-between text-[10px] py-0.5">
                                        <span className="text-zinc-500">
                                            Attack model
                                        </span>
                                        <span className="font-mono text-zinc-300">
                                            {meta.attack_model as string}
                                        </span>
                                    </div>
                                )}
                                {(meta.attack_strength !== undefined ||
                                    meta.attack_steps !== undefined ||
                                    meta.attack_guidance !== undefined) && (
                                    <div className="flex gap-3 text-[10px] py-0.5 flex-wrap">
                                        {meta.attack_strength !==
                                            undefined && (
                                            <span className="text-zinc-500">
                                                strength{" "}
                                                <span className="text-zinc-300 font-mono">
                                                    {
                                                        meta.attack_strength as number
                                                    }
                                                </span>
                                            </span>
                                        )}
                                        {meta.attack_steps !== undefined && (
                                            <span className="text-zinc-500">
                                                steps{" "}
                                                <span className="text-zinc-300 font-mono">
                                                    {
                                                        meta.attack_steps as number
                                                    }
                                                </span>
                                            </span>
                                        )}
                                        {meta.attack_guidance !==
                                            undefined && (
                                            <span className="text-zinc-500">
                                                cfg{" "}
                                                <span className="text-zinc-300 font-mono">
                                                    {
                                                        meta.attack_guidance as number
                                                    }
                                                </span>
                                            </span>
                                        )}
                                    </div>
                                )}
                                {!!meta.attack_prompt && (
                                    <div className="mt-1">
                                        <p className="text-[10px] text-zinc-500 mb-0.5">
                                            Style imitation prompt
                                        </p>
                                        <div className="bg-zinc-800/60 p-1.5 rounded">
                                            <code className="text-[10px] text-zinc-300 block leading-tight break-words whitespace-pre-wrap">
                                                &quot;
                                                {meta.attack_prompt as string}
                                                &quot;
                                            </code>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* L3 — Editing attack details */}
                        {layerId === "layer_3_editing" && (
                            <div className="space-y-0.5">
                                {!!meta.attack_model && (
                                    <div className="flex justify-between text-[10px] py-0.5">
                                        <span className="text-zinc-500">
                                            Editor model
                                        </span>
                                        <span className="font-mono text-zinc-300">
                                            {meta.attack_model as string}
                                        </span>
                                    </div>
                                )}
                                {(meta.attack_steps !== undefined ||
                                    meta.attack_guidance !== undefined) && (
                                    <div className="flex gap-3 text-[10px] py-0.5 flex-wrap">
                                        {meta.attack_steps !== undefined && (
                                            <span className="text-zinc-500">
                                                steps{" "}
                                                <span className="text-zinc-300 font-mono">
                                                    {
                                                        meta.attack_steps as number
                                                    }
                                                </span>
                                            </span>
                                        )}
                                        {meta.attack_guidance !==
                                            undefined && (
                                            <span className="text-zinc-500">
                                                cfg{" "}
                                                <span className="text-zinc-300 font-mono">
                                                    {
                                                        meta.attack_guidance as number
                                                    }
                                                </span>
                                            </span>
                                        )}
                                    </div>
                                )}
                                {!!meta.edit_instruction && (
                                    <div className="mt-1">
                                        <p className="text-[10px] text-zinc-500 mb-0.5">
                                            Edit instruction
                                        </p>
                                        <div className="bg-zinc-800/60 p-1.5 rounded">
                                            <code className="text-[10px] text-zinc-300 block leading-tight break-words whitespace-pre-wrap">
                                                &quot;
                                                {meta.edit_instruction as string}
                                                &quot;
                                            </code>
                                        </div>
                                    </div>
                                )}
                                {/* Kontext disruption results */}
                                {(meta.kontext as any)
                                    ?.disruption_ratio != null && (
                                    <div className="flex justify-between text-[10px] py-0.5 mt-0.5">
                                        <span className="text-zinc-500">
                                            Kontext disruption ratio
                                        </span>
                                        <span
                                            className={cn(
                                                "font-mono",
                                                (
                                                    (meta.kontext as any)
                                                        .disruption_ratio as number
                                                ) > 2
                                                    ? "text-emerald-400"
                                                    : "text-yellow-400",
                                            )}
                                        >
                                            {(
                                                (meta.kontext as any)
                                                    .disruption_ratio as number
                                            ).toFixed(2)}
                                            ×
                                        </span>
                                    </div>
                                )}
                                {(meta.kontext as any)?.baseline_variance !=
                                    null &&
                                    (meta.kontext as any)
                                        ?.protected_variance != null && (
                                        <div className="flex justify-between text-[10px] py-0.5">
                                            <span className="text-zinc-500">
                                                Edit variance (orig → prot)
                                            </span>
                                            <span className="font-mono text-zinc-400">
                                                {(
                                                    (meta.kontext as any)
                                                        .baseline_variance as number
                                                ).toFixed(0)}{" "}
                                                →{" "}
                                                {(
                                                    (meta.kontext as any)
                                                        .protected_variance as number
                                                ).toFixed(0)}
                                            </span>
                                        </div>
                                    )}
                                {/* FLUX VAE proxy result */}
                                {(meta.flux_vae_proxy as any)
                                    ?.disruption_score != null && (
                                    <div className="flex justify-between text-[10px] py-0.5">
                                        <span className="text-zinc-500">
                                            VAE latent L2 disruption
                                        </span>
                                        <span
                                            className={cn(
                                                "font-mono",
                                                (
                                                    (meta.flux_vae_proxy as any)
                                                        .disruption_score as number
                                                ) > 0.01
                                                    ? "text-emerald-400"
                                                    : "text-yellow-400",
                                            )}
                                        >
                                            {(
                                                (meta.flux_vae_proxy as any)
                                                    .disruption_score as number
                                            ).toFixed(4)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* v3: Layer 4 robustness breakdown */}
                {layerId === "layer_4_watermark" &&
                    (meta.jpeg_80 as unknown) !== undefined && (
                        <div className="mt-3 border-t border-zinc-700/50 pt-2">
                            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1.5">
                                Robustness Tests
                            </p>
                            <div className="space-y-0.5">
                                {(
                                    [
                                        {
                                            label: "Direct decode",
                                            data: meta.direct,
                                        },
                                        {
                                            label: "JPEG q80",
                                            data: meta.jpeg_80,
                                        },
                                        {
                                            label: "JPEG q60",
                                            data: meta.jpeg_60,
                                        },
                                        {
                                            label: "VAE encode-decode",
                                            data: meta.vae_pass,
                                        },
                                        {
                                            label: "Bilateral filter",
                                            data: meta.bilateral,
                                        },
                                    ] as {
                                        label: string;
                                        data?: {
                                            detected?: boolean;
                                            match?: boolean;
                                        };
                                    }[]
                                )
                                    .filter((item) => item.data)
                                    .map((item) => {
                                        const sim = (item.data as { similarity?: number } | undefined)?.similarity;
                                        return (
                                            <div
                                                key={item.label}
                                                className="flex justify-between text-[10px] py-0.5"
                                            >
                                                <span className="text-zinc-500">
                                                    {item.label}
                                                </span>
                                                <span
                                                    className={cn(
                                                        "font-mono",
                                                        sim !== undefined
                                                            ? sim >= 0.8
                                                                ? "text-emerald-400"
                                                                : sim >= 0.4
                                                                  ? "text-yellow-400"
                                                                  : item.data?.detected
                                                                    ? "text-yellow-600"
                                                                    : "text-zinc-600"
                                                            : item.data?.match
                                                              ? "text-emerald-400"
                                                              : item.data?.detected
                                                                ? "text-yellow-400"
                                                                : "text-zinc-600",
                                                    )}
                                                >
                                                    {sim !== undefined
                                                        ? `${(sim * 100).toFixed(0)}% match`
                                                        : item.data?.match
                                                          ? "✓ match"
                                                          : item.data?.detected
                                                            ? "detected"
                                                            : "not found"}
                                                </span>
                                            </div>
                                        );
                                    })}
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
        <div
            className={cn(
                "h-full flex flex-col overflow-hidden bg-zinc-950",
                className,
            )}
        >
            {/* Header */}
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/60 flex items-center gap-3 shrink-0">
                {/* Large icon — left */}
                <Activity className="w-6 h-6 text-emerald-500 shrink-0" />

                {/* Title + meta — right */}
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium uppercase tracking-wider text-zinc-300">
                        Protection Audit Log
                    </div>
                    <div className="text-[10px] mt-0.5 flex items-center gap-1.5 text-zinc-500 flex-wrap">
                        {statusDate && (
                            <span suppressHydrationWarning>
                                {formatDistanceToNow(new Date(statusDate), {
                                    addSuffix: true,
                                })}
                            </span>
                        )}
                        {jobResult?.total_duration_ms && (
                            <span>
                                •{" "}
                                {(jobResult.total_duration_ms / 1000).toFixed(1)}s total
                            </span>
                        )}
                        {isProcessing && <span>• Running…</span>}
                        {detectedArtType && (
                            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium text-[9px] uppercase tracking-wide">
                                {formatArtType(detectedArtType)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Status badge — far right */}
                <div className="shrink-0">
                    {isFailed && (
                        <Badge variant="destructive" className="text-[10px]">
                            <ShieldAlert className="w-3 h-3 mr-1" /> Failed
                        </Badge>
                    )}
                    {isProcessing && (
                        <Badge
                            variant="secondary"
                            className="animate-pulse text-[10px] bg-blue-900/30 text-blue-400 border-blue-700/30"
                        >
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Active
                        </Badge>
                    )}
                </div>
            </div>

            {/* Accordion list */}
            <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                    {/* ── Shield Score Widget ── */}
                    {jobResult && (
                        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-4 pt-5 pb-4 mb-2">
                            {/* 270° fuel gauge — gap pointing down */}
                            {(() => {
                                const raw = jobResult.shieldScore;
                                if (raw === undefined) {
                                    return (
                                        <div className="flex justify-center py-8">
                                            <Loader2 className="w-7 h-7 text-zinc-600 animate-spin" />
                                        </div>
                                    );
                                }
                                // 270° arc: 0% at bottom-left (225°), 100% at bottom-right (315°)
                                // gap (90°) points straight down.
                                // SVG has y-axis pointing DOWN, so "over the top" = clockwise = sweep=1
                                const cx = 100, cy = 88, radius = 68;
                                const toRad = (d: number) => (d * Math.PI) / 180;
                                const startDeg = 225; // standard math angle for 0%
                                const totalDeg = 270;
                                const p0x = cx + radius * Math.cos(toRad(startDeg));
                                const p0y = cy - radius * Math.sin(toRad(startDeg));
                                const p100x = cx + radius * Math.cos(toRad(startDeg - totalDeg));
                                const p100y = cy - radius * Math.sin(toRad(startDeg - totalDeg));
                                // Track: full 270° arc, sweep=1 (clockwise in SVG = visually over the top)
                                const trackD = `M ${p0x.toFixed(2)} ${p0y.toFixed(2)} A ${radius} ${radius} 0 1 1 ${p100x.toFixed(2)} ${p100y.toFixed(2)}`;
                                // Fill: from 0% to score, same clockwise direction
                                const score = Math.min(99.9, Math.max(0.1, raw));
                                const arcDeg = (score / 100) * totalDeg;
                                const endDeg = startDeg - arcDeg;
                                const ex = cx + radius * Math.cos(toRad(endDeg));
                                const ey = cy - radius * Math.sin(toRad(endDeg));
                                const largeArc = arcDeg > 180 ? 1 : 0;
                                const fillD = `M ${p0x.toFixed(2)} ${p0y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
                                const gaugeColor = raw >= 80 ? "#34d399" : raw >= 50 ? "#facc15" : "#f87171";
                                const gaugeLabel = raw >= 80 ? "HIGH PROTECTION" : raw >= 50 ? "MEDIUM PROTECTION" : "LOW PROTECTION";
                                return (
                                    <svg viewBox="0 0 200 152" className="w-full" style={{ display: "block" }}>
                                        {/* Track */}
                                        <path d={trackD} fill="none" stroke="#27272a" strokeWidth="11" strokeLinecap="round" />
                                        {/* Fill */}
                                        <path d={fillD} fill="none" stroke={gaugeColor} strokeWidth="11" strokeLinecap="round" />
                                        {/* Text group — groupY is the single knob for vertical centering */}
                                        <g transform={`translate(0, ${cy - 10})`}>
                                            {/* x shifted +5 right: % is small so textAnchor="middle" pulls the
                                                whole string left; the offset re-centers the number digits */}
                                            <text x={cx + 5} y={18} textAnchor="middle" fill={gaugeColor} fontFamily="ui-monospace,monospace" fontSize="48" fontWeight="bold">
                                                {raw.toFixed(0)}<tspan fontSize="16" dy="-24" dx="3" fill={gaugeColor}>%</tspan>
                                            </text>
                                            <text x={cx} y={37} textAnchor="middle" fill={gaugeColor} fontFamily="ui-sans-serif,sans-serif" fontSize="6.5" fontWeight="600" letterSpacing="1">{gaugeLabel}</text>
                                        </g>
                                    </svg>
                                );
                            })()}
                            {/* Per-layer breakdown */}
                            <div className="mt-3 border-t border-zinc-800/40 pt-3 space-y-2">
                                {PIPELINE_LAYERS.map((l) => {
                                    const r = getStepResult(l.id);
                                    const st = r?.status ?? "PENDING";
                                    return (
                                        <div key={l.id} className="flex justify-between items-center">
                                            <span className="text-xs text-zinc-400">{l.label}</span>
                                            <span className={cn(
                                                "font-mono text-[10px]",
                                                st === "PASS" ? "text-emerald-400"
                                                    : st === "FAIL" ? "text-red-400"
                                                    : st === "SKIPPED" ? "text-zinc-600"
                                                    : "text-zinc-500",
                                            )}>
                                                {st}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {/* ── Per-layer accordion items ── */}
                    {PIPELINE_LAYERS.map((layer, idx) => {
                        const result = getStepResult(layer.id);
                        const stepStatus = result?.status || "PENDING";
                        const isOpen = openLayerId === layer.id;
                        const meta = (result?.verification_meta ||
                            {}) as Record<string, unknown>;
                        const interp = getInterpretation(
                            layer.layerKey,
                            stepStatus,
                            meta,
                        );
                        const variantKey = LAYER_VARIANT[layer.layerKey];
                        const isActiveVariant =
                            !!variantKey &&
                            (selectedVariant === variantKey ||
                                selectedVariant === `${variantKey}_orig`);

                        // Icon + colors based on status
                        let statusIcon = (
                            <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        );
                        let statusColor = "text-zinc-500";
                        let dotColor = "bg-zinc-600";
                        let borderColor = "border-zinc-700/50";

                        if (stepStatus === "PASS") {
                            statusIcon = (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            );
                            statusColor = "text-emerald-400";
                            dotColor = "bg-emerald-500";
                            borderColor = "border-emerald-700/40";
                        } else if (stepStatus === "FAIL") {
                            statusIcon = (
                                <XCircle className="w-3.5 h-3.5 text-red-400" />
                            );
                            statusColor = "text-red-400";
                            dotColor = "bg-red-500";
                            borderColor = "border-red-800/40";
                        } else if (stepStatus === "ERROR") {
                            statusIcon = (
                                <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
                            );
                            statusColor = "text-orange-400";
                            dotColor = "bg-orange-500";
                            borderColor = "border-orange-800/40";
                        } else if (stepStatus === "PROCESSING") {
                            statusIcon = (
                                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                            );
                            statusColor = "text-blue-400";
                            dotColor = "bg-blue-500 animate-pulse";
                            borderColor = "border-blue-700/40";
                        } else if (stepStatus === "SKIPPED") {
                            statusIcon = (
                                <MinusCircle className="w-3.5 h-3.5 text-zinc-600" />
                            );
                            statusColor = "text-zinc-600";
                            dotColor = "bg-zinc-700";
                            borderColor = "border-zinc-700/30";
                        }

                        return (
                            <div
                                key={layer.id}
                                className={cn(
                                    "rounded-lg border transition-all duration-200 overflow-hidden",
                                    isActiveVariant
                                        ? "border-emerald-600/40 bg-zinc-900"
                                        : cn("bg-zinc-900/60", borderColor),
                                )}
                            >
                                {/* Accordion Header */}
                                <button
                                    type="button"
                                    onClick={() => toggleLayer(layer.id)}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-800/50 transition-colors"
                                >
                                    {/* Layer number dot */}
                                    <div
                                        className={cn(
                                            "w-1.5 h-1.5 rounded-full shrink-0",
                                            dotColor,
                                        )}
                                    />

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] text-zinc-600 font-medium">
                                                L{idx + 1}
                                            </span>
                                            <span className="text-xs font-medium text-zinc-200 truncate">
                                                {layer.label}
                                            </span>
                                        </div>
                                        {/* Interpretation headline — visible even when collapsed */}
                                        {result && stepStatus !== "PENDING" && (
                                            <p
                                                className={cn(
                                                    "text-[10px] mt-0.5 truncate",
                                                    interp.isGood
                                                        ? "text-emerald-400/80"
                                                        : statusColor,
                                                )}
                                            >
                                                {interp.headline}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {statusIcon}
                                        <ChevronDown
                                            className={cn(
                                                "w-3 h-3 text-zinc-600 transition-transform",
                                                isOpen && "rotate-180",
                                            )}
                                        />
                                    </div>
                                </button>

                                {/* Expanded Content */}
                                {isOpen && (
                                    <div className="px-3 pb-3 border-t border-zinc-800/60">
                                        {/* Description */}
                                        <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
                                            {layer.description}
                                        </p>
                                        {/* v3: attack simulation description from simulation engine */}
                                        {!!result &&
                                            !!meta?.attack_description && (
                                                <p className="text-[10px] text-zinc-600 mt-1 leading-relaxed italic border-l-2 border-zinc-700 pl-2">
                                                    {String(
                                                        meta.attack_description,
                                                    )}
                                                </p>
                                            )}

                                        {/* Interpretation — full detail */}
                                        {result && stepStatus !== "PENDING" && (
                                            <div
                                                className={cn(
                                                    "mt-2 p-2 rounded-md text-[11px] leading-snug",
                                                    interp.isGood
                                                        ? "bg-emerald-950/40 border border-emerald-700/30 text-emerald-300"
                                                        : stepStatus === "ERROR"
                                                          ? "bg-orange-950/30 border border-orange-700/30 text-orange-300"
                                                          : "bg-yellow-950/30 border border-yellow-700/30 text-yellow-300",
                                                )}
                                            >
                                                {interp.detail}
                                            </div>
                                        )}

                                        {/* Technical metrics */}
                                        {renderVerificationDetails(
                                            layer.id,
                                            result,
                                        )}

                                        {/* Errors */}
                                        {result?.error && (
                                            <div className="mt-2 text-[10px] bg-red-950/40 text-red-400 p-2 rounded border border-red-800/30 flex items-start gap-2">
                                                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                                <span className="break-all">
                                                    {result.error}
                                                </span>
                                            </div>
                                        )}
                                        {!result?.error && !!meta?.error && (
                                            <div className="mt-2 text-[10px] bg-orange-950/30 text-orange-400 p-2 rounded border border-orange-800/30 flex items-start gap-2">
                                                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                                <span className="break-all">
                                                    {String(meta.error)}
                                                </span>
                                            </div>
                                        )}

                                        {/* Footer: duration + preview buttons */}
                                        <div className="mt-3 pt-2 border-t border-zinc-800/60 flex items-center justify-between gap-2">
                                            <span className="text-[10px] text-zinc-600">
                                                {result?.duration_ms !==
                                                undefined
                                                    ? `⏱ ${(result.duration_ms / 1000).toFixed(1)}s`
                                                    : ""}
                                            </span>

                                            {/* Preview variant buttons — dual pattern for all layers */}
                                            {result?.r2_key &&
                                                onSelectVariant && (
                                                    <div className="flex gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                onSelectVariant(
                                                                    variantKey,
                                                                )
                                                            }
                                                            className={cn(
                                                                "text-[10px] px-2 py-0.5 rounded-full border transition-all",
                                                                selectedVariant ===
                                                                    variantKey
                                                                    ? "bg-emerald-600 border-emerald-600 text-white"
                                                                    : "border-zinc-700 text-zinc-400 hover:border-emerald-600 hover:text-emerald-400",
                                                            )}
                                                        >
                                                            {result.r2_key_original
                                                                ? "Protected"
                                                                : "Preview"}
                                                        </button>
                                                        {result.r2_key_original && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    onSelectVariant(
                                                                        `${variantKey}_orig`,
                                                                    )
                                                                }
                                                                className={cn(
                                                                    "text-[10px] px-2 py-0.5 rounded-full border transition-all",
                                                                    selectedVariant ===
                                                                        `${variantKey}_orig`
                                                                        ? "bg-zinc-500 border-zinc-500 text-white"
                                                                        : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300",
                                                                )}
                                                            >
                                                                Original
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

            {/* Debug copy button */}
            {jobResult && (
                <div className="shrink-0 px-3 py-2 border-t border-zinc-800 bg-zinc-900/60">
                    <button
                        type="button"
                        onClick={() => {
                            const compact = {
                                status,
                                shieldScore: jobResult.shieldScore,
                                total_duration_ms: jobResult.total_duration_ms,
                                error: jobResult.error_message,
                                steps: jobResult.steps?.map((s) => ({
                                    name: s.step_name,
                                    status: s.status,
                                    duration_ms: s.duration_ms,
                                    error: s.error,
                                    r2_key: s.r2_key,
                                    r2_key_original: s.r2_key_original,
                                    meta: s.verification_meta,
                                })),
                            };
                            navigator.clipboard
                                .writeText(JSON.stringify(compact, null, 2))
                                .then(() => {
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                });
                        }}
                        className="w-full flex items-center justify-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 py-1 rounded transition-colors"
                    >
                        <Copy className="w-3 h-3" />
                        {copied ? "Copied!" : "Copy debug report"}
                    </button>
                </div>
            )}
        </div>
    );
}
