"use client";

import {
    Activity,
    AlertCircle,
    CheckCircle2,
    Clock,
    Eye,
    Fingerprint,
    Image as ImageIcon,
    Loader2,
    Shield,
    ShieldAlert,
    UserX,
    XCircle,
    Copy,
    Share2,
    FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
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
}

export function ProtectionAuditTrail({
    jobResult,
    status,
    statusDate,
    className,
    r2BaseUrl,
}: ProtectionAuditTrailProps) {
    // Helper: Find step result
    const getStepResult = (stepKey: string): StepResult | undefined => {
        return jobResult?.steps?.find((s) => s.step_name === stepKey);
    };

    // Helper: Render Metric
    const renderMetric = (label: string, value: string | number, isGood: boolean) => (
        <div className="flex justify-between items-center text-xs mt-1 bg-muted/50 p-1.5 rounded">
            <span className="text-muted-foreground">{label}:</span>
            <span className={cn("font-mono font-medium", isGood ? "text-green-600" : "text-yellow-600")}>
                {value}
            </span>
        </div>
    );

    const renderVerificationDetails = (layerId: string, result: StepResult) => {
        const layer = PIPELINE_LAYERS.find((l) => l.id === layerId);
        if (!layer || layer.verificationMetrics.length === 0) return null;

        const meta = result.verification_meta || {};

        const formatValue = (value: unknown, metric: VerificationMetricConfig): string | number => {
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

        return (
            <div className="mt-3 space-y-1">
                {layer.verificationMetrics.map((metric) => {
                    const value = meta[metric.key];

                    if (metric.format === "code") {
                        if (!value) return null;
                        return (
                            <div key={metric.key} className="mt-1 bg-muted/50 p-1.5 rounded">
                                <span className="text-[10px] text-muted-foreground block mb-0.5">{metric.label}</span>
                                <code className="text-[10px] break-all block leading-tight">{String(value)}</code>
                            </div>
                        );
                    }

                    if (value === undefined || value === null) return null;

                    return (
                        <div key={metric.key}>
                            {renderMetric(metric.label, formatValue(value, metric), isGoodValue(value, metric))}
                        </div>
                    );
                })}
            </div>
        );
    };

    // Overall Status Logic
    const isCompleted = status === "completed" || status === "done";
    const isFailed = status === "failed";
    const isProcessing = status === "processing" || status === "queued";

    return (
        <Card className={cn("h-full border-l-0 rounded-l-none shadow-none", className)}>
            <CardHeader className="pb-4 border-b bg-muted/10">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-sm font-medium uppercase tracking-wider flex items-center gap-2">
                            <Activity className="w-4 h-4 text-primary" />
                            Protection Audit Log
                        </CardTitle>
                        <CardDescription className="text-xs mt-1 flex items-center gap-2">
                             {statusDate && <span suppressHydrationWarning>{formatDistanceToNow(new Date(statusDate), { addSuffix: true })}</span>}
                             • {jobResult?.total_duration_ms ? `${(jobResult.total_duration_ms / 1000).toFixed(1)}s` : isProcessing ? "Running..." : "Idle"}
                        </CardDescription>
                    </div>
                    
                    {/* Aggregated Score Badge */}
                    {isCompleted && jobResult?.shieldScore !== undefined && (
                        <div className="flex flex-col items-center mr-4">
                             <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Shield Score</div>
                             <div className={cn("text-2xl font-bold font-mono tracking-tighter",
                                 jobResult.shieldScore >= 90 ? "text-green-500" :
                                 jobResult.shieldScore >= 70 ? "text-yellow-500" : "text-red-500"
                             )}>
                                 {jobResult.shieldScore.toFixed(0)}
                             </div>
                        </div>
                    )}
                    
                    <div>
                        {isCompleted && <Badge variant="default" className="bg-green-600 hover:bg-green-700"><CheckCircle2 className="w-3 h-3 mr-1"/> Certified</Badge>}
                        {isFailed && <Badge variant="destructive"><ShieldAlert className="w-3 h-3 mr-1"/> Failed</Badge>}
                        {isProcessing && <Badge variant="secondary" className="animate-pulse"><Loader2 className="w-3 h-3 mr-1 animate-spin"/> Active</Badge>}
                    </div>
                </div>
            </CardHeader>
            <ScrollArea className="h-[calc(100vh-140px)]">
                <CardContent className="pt-6 space-y-8 pr-6">
                    {/* Pipeline Visualization */}
                    <div className="relative border-l-2 border-muted ml-3 space-y-8 pb-4">
                        {PIPELINE_LAYERS.map((layer, idx) => {
                            const result = getStepResult(layer.id);
                            const stepStatus = result?.status || "PENDING";
                            
                            // Determine current visual state
                            let stateIcon = <Clock className="w-4 h-4 text-muted-foreground" />;
                            let ringColor = "border-muted-foreground/20";
                            let iconBg = "bg-muted";

                            if (stepStatus === "PASS") {
                                stateIcon = <CheckCircle2 className="w-4 h-4 text-white" />;
                                ringColor = "border-green-500";
                                iconBg = "bg-green-500";
                            } else if (stepStatus === "FAIL") {
                                stateIcon = <XCircle className="w-4 h-4 text-white" />;
                                ringColor = "border-red-500";
                                iconBg = "bg-red-500";
                            } else if (stepStatus === "PROCESSING") {
                                stateIcon = <Loader2 className="w-4 h-4 text-white animate-spin" />;
                                ringColor = "border-blue-500";
                                iconBg = "bg-blue-500";
                            }

                            return (
                                <div key={layer.id} className="relative pl-8">
                                    {/* Timeline Node */}
                                    <div className={cn(
                                        "absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 flex items-center justify-center z-10 box-content",
                                        "bg-background transition-colors duration-300",
                                        ringColor
                                    )}>
                                        <div className={cn("w-2.5 h-2.5 rounded-full", stepStatus === "PROCESSING" ? "bg-blue-500 animate-pulse" : (stepStatus === "PASS" ? "bg-green-500" : (stepStatus === "FAIL" ? "bg-red-500" : "bg-muted-foreground/30")))} />
                                    </div>

                                    {/* Content Card */}
                                    <div className={cn(
                                        "rounded-lg border p-3 transition-all duration-300",
                                        stepStatus === "PROCESSING" ? "shadow-md ring-1 ring-blue-100 border-blue-200 bg-blue-50/10" : "hover:border-primary/20 bg-card"
                                    )}>
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 text-muted-foreground font-normal">Layer {idx + 1}</Badge>
                                                <h4 className="text-sm font-semibold">{layer.label}</h4>
                                            </div>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <div className={cn("p-1 rounded-full", iconBg)}>
                                                            {stateIcon}
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>{stepStatus}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </div>
                                        
                                        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                                            {layer.description}
                                        </p>

                                        {/* Dynamic Verification Details */}
                                        {result && result.status !== "PENDING" && (
                                            <div className="animate-in fade-in zoom-in-95 duration-300">
                                                {renderVerificationDetails(layer.id, result)}
                                                
                                                {/* Error View */}
                                                {result.error && (
                                                    <div className="mt-2 text-xs bg-red-50 text-red-700 p-2 rounded border border-red-100 flex items-start gap-2">
                                                        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                                        <span className="break-all">{result.error}</span>
                                                    </div>
                                                )}

                                                {/* Debug Links */}
                                                {result.r2_key && r2BaseUrl && (
                                                    <div className="mt-3 pt-2 border-t flex justify-end">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-primary"
                                                            onClick={() => window.open(`${r2BaseUrl}/${result.r2_key}`, "_blank")}
                                                        >
                                                            <Eye className="w-3 h-3" /> View Layer Output
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Final Actions */}
                    {isCompleted && (
                        <div className="pt-4 border-t mt-4 flex flex-col gap-2">
                            <Button variant="outline" size="sm" className="w-full justify-start text-xs font-normal">
                                <FileText className="w-3 h-3 mr-2" /> Download Verification Report (PDF)
                            </Button>
                            <Button variant="outline" size="sm" className="w-full justify-start text-xs font-normal">
                                <Share2 className="w-3 h-3 mr-2" /> Share Protection Certificate
                            </Button>
                        </div>
                    )}
                </CardContent>
            </ScrollArea>
        </Card>
    );
}