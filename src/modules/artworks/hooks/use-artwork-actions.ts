import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "react-hot-toast";
import {
    cancelProtectionAction,
    deleteArtworkAction,
    retryProtectionAction,
} from "../actions/manage-artwork.actions";
import { ProtectionStatus } from "../models/artwork.enum";
import type { Artwork } from "../schemas/artwork.schema";

export function useArtworkActions(artwork: Artwork) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);

    const executeDelete = () => {
        startTransition(async () => {
            const res = await deleteArtworkAction(artwork.id);
            if (res.success) {
                toast.success("Deleted");
                setDeleteOpen(false);
            } else toast.error(res.error || "Failed");
        });
    };

    const handleDownload = () => {
        // Assuming protectedUrl exists if we are calling this, but safe check
        const urlToOpen = artwork.protectedUrl;
        if (urlToOpen) window.open(urlToOpen, "_blank");
    };

    const handleCancel = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        startTransition(async () => {
            const res = await cancelProtectionAction(artwork.id);
            if (res.success) toast.success("Protection canceled");
            else toast.error(res.error || "Failed");
        });
    };

    const handleRetry = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setIsRetrying(true);
        startTransition(async () => {
            const res = await retryProtectionAction(artwork.id);
            setIsRetrying(false);
            if (res.success) toast.success("Retrying protection");
            else toast.error(res.error || "Failed");
        });
    };

    const isProtected = artwork.protectionStatus === ProtectionStatus.PROTECTED;
    const isActuallyProcessing =
        artwork.protectionStatus === ProtectionStatus.PENDING ||
        artwork.protectionStatus === ProtectionStatus.PROCESSING;
    
    // Optimistic processing state: true if actual DB says so OR if we are currently retrying
    const isProcessing = isActuallyProcessing || isRetrying;
    
    const isFailed = !isRetrying && artwork.protectionStatus === ProtectionStatus.FAILED;
    const isCanceled = !isRetrying && artwork.protectionStatus === ProtectionStatus.CANCELED;

    // Derived optimistic status for badge display
    const optimisticStatus = isRetrying 
        ? ProtectionStatus.PROCESSING 
        : artwork.protectionStatus;

    return {
        isPending,
        deleteOpen,
        setDeleteOpen,
        executeDelete,
        handleDownload,
        handleCancel,
        handleRetry,
        isProtected,
        isProcessing,
        isFailed,
        isCanceled,
        isRetrying,
        optimisticStatus, // Expose this for UI components
    };
}
