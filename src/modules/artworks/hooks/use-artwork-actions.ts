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
import { getArtworkDisplayUrl } from "../utils/artwork-url";

export function useArtworkActions(artwork: Artwork) {
    const _router = useRouter();
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

    const handleDownload = async (e?: React.MouseEvent) => {
        e?.stopPropagation();
        const urlToOpen = getArtworkDisplayUrl(artwork);
        if (!urlToOpen) return;

        try {
            toast.loading("Downloading...", { id: "download" });

            // Fetch blob to force download
            const response = await fetch(urlToOpen);
            if (!response.ok) throw new Error("Download failed");

            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = blobUrl;

            // Clean title for filename
            const safeTitle = (artwork.title || "artwork")
                .replace(/[^a-z0-9]/gi, "_")
                .toLowerCase();
            link.download = `${safeTitle}_protected.png`; // Assuming Mist output is PNG

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);

            toast.success("Download started", { id: "download" });
        } catch (error) {
            console.error("Download error:", error);
            toast.error(
                "Download failed details. Opening in new tab instead.",
                { id: "download" },
            );
            // Fallback
            window.open(urlToOpen, "_blank");
        }
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
        artwork.protectionStatus === ProtectionStatus.PROCESSING ||
        artwork.protectionStatus === ProtectionStatus.UPLOADING ||
        artwork.protectionStatus === ProtectionStatus.QUEUED ||
        artwork.protectionStatus === ProtectionStatus.RUNNING;

    // Optimistic processing state: true if actual DB says so OR if we are currently retrying
    const isProcessing = isActuallyProcessing || isRetrying;

    const isFailed =
        !isRetrying && artwork.protectionStatus === ProtectionStatus.FAILED;
    const isCanceled =
        !isRetrying && artwork.protectionStatus === ProtectionStatus.CANCELED;

    // Derived optimistic status for badge display
    const optimisticStatus = isRetrying
        ? ProtectionStatus.QUEUED
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
