import { Loader2, Shield, XCircle } from "lucide-react";
import { ProtectionStatus, ProtectionStatusType } from "../models/artwork.enum";

interface ArtworkStatusBadgeProps {
    status: ProtectionStatusType;
    className?: string;
}

export function ArtworkStatusBadge({
    status,
    className,
}: ArtworkStatusBadgeProps) {
    const isProtected = status === ProtectionStatus.PROTECTED;
    const isProcessing =
        status === ProtectionStatus.PENDING ||
        status === ProtectionStatus.PROCESSING;
    const isFailed = status === ProtectionStatus.FAILED;
    const isCanceled = status === ProtectionStatus.CANCELED;

    return (
        <div
            className={`pointer-events-auto drop-shadow-md ${className || ""}`}
            title={status}
        >
            {isProcessing && (
                <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            )}
            {isProtected && <Shield className="h-5 w-5 text-green-400" />}
            {isFailed && <XCircle className="h-5 w-5 text-red-500" />}
            {isCanceled && <XCircle className="h-5 w-5 text-gray-400" />}
        </div>
    );
}
