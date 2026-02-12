import {
    Loader2,
    type LucideIcon,
    Shield,
    XCircle,
    ShieldCheck,
    FileImage,
} from "lucide-react";
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
    bg?: string;
    color: string;
    icon: LucideIcon;
    animate?: boolean;
}

const statusConfig: Record<ProtectionStatusType, StatusConfigItem> = {
    [ProtectionStatus.IDLE]: {
        label: "Original",
        color: "text-zinc-400",
        icon: FileImage,
        animate: false,
    },
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
        label: "Protected",
        // bg: "bg-blue-500/20",
        color: "text-blue-400",
        icon: ShieldCheck,
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
    // Hide badge for IDLE state to reduce visual noise, OR simplify it.
    // User asked explicit request for "blue shield for DONE".
    // For IDLE, let's keep it hidden or subtle.
    if (status === ProtectionStatus.IDLE) return null;

    const config =
        statusConfig[status] || statusConfig[ProtectionStatus.QUEUED];
    const Icon = config.icon;

    return (
        <div
            className={cn(
                "flex items-center justify-center gap-1.5 h-7 px-2 bg-black/60 backdrop-blur-md rounded-full text-xs font-medium text-white shadow-sm pointer-events-auto select-none",
                config.bg, // Optional bg override
                className,
            )}
            title={status}
        >
            <Icon
                className={cn(
                    "h-4 w-4",
                    config.color,
                    config.animate && "animate-spin",
                )}
            />
            <span
                className={cn(
                    status === ProtectionStatus.DONE && "text-blue-100",
                )}
            >
                {config.label}
            </span>
        </div>
    );
}
