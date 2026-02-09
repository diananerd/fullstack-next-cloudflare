import { Loader2, type LucideIcon, Shield, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    ProtectionStatus,
    type ProtectionStatusType,
} from "../models/artwork.enum";

interface ArtworkStatusBadgeProps {
    status: ProtectionStatusType;
    className?: string;
}

interface StatusConfigItem {
    label: string;
    color: string;
    icon: LucideIcon;
    animate?: boolean;
}

const statusConfig: Record<ProtectionStatusType, StatusConfigItem> = {
    [ProtectionStatus.UPLOADING]: {
        label: "Uploading",
        color: "text-blue-400",
        icon: Loader2,
        animate: true,
    },
    [ProtectionStatus.QUEUED]: {
        label: "Queued",
        color: "text-amber-400",
        icon: Loader2, // You might want a different icon for Queued, maybe Hourglass? But Loader is fine.
        animate: true,
    },
    [ProtectionStatus.DONE]: {
        label: "Done",
        color: "text-gray-300",
        icon: Shield,
        animate: false,
    },
    [ProtectionStatus.PROCESSING]: {
        label: "Processing",
        color: "text-blue-400",
        icon: Loader2,
        animate: true,
    },
    [ProtectionStatus.FAILED]: {
        label: "Failed",
        color: "text-red-500",
        icon: XCircle,
    },
    [ProtectionStatus.CANCELED]: {
        label: "Canceled",
        color: "text-gray-400",
        icon: XCircle,
    },
};

export function ArtworkStatusBadge({
    status,
    className,
}: ArtworkStatusBadgeProps) {
    if (status === ProtectionStatus.DONE) return null;

    const config =
        statusConfig[status] || statusConfig[ProtectionStatus.QUEUED];
    const Icon = config.icon;

    return (
        <div
            className={cn(
                "flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-xs font-medium text-white shadow-sm pointer-events-auto select-none",
                className,
            )}
            title={status}
        >
            <Icon
                className={cn(
                    "h-3.5 w-3.5",
                    config.color,
                    config.animate && "animate-spin",
                )}
            />
            <span>{config.label}</span>
        </div>
    );
}
