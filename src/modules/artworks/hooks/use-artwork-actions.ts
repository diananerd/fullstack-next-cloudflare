import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "react-hot-toast";
import { FEATURES } from "@/constants/features.constant";
import {
    cancelProtectionAction,
    deleteArtworkAction,
    retryProtectionAction,
    updateArtworkVisibilityAction,
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
        const urlToOpen = FEATURES.shield
            ? getArtworkDisplayUrl(artwork)
            : artwork.url;
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

            // Try to detect extension from URL, default to png
            let extension = "png";
            try {
                const urlPath = new URL(urlToOpen, window.location.origin)
                    .pathname;
                const extMatch = urlPath.match(/\.([a-zA-Z0-9]+)$/);
                if (extMatch && extMatch[1]) extension = extMatch[1];
            } catch (e) {
                /* ignore */
            }

            const suffix = isAnyDone ? "_protected" : "_original";
            link.download = `${safeTitle}${suffix}.${extension}`;

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

    const handleVisibilityChange = (
        e?: React.MouseEvent,
        visibility?: "public" | "private",
    ) => {
        e?.stopPropagation();
        const next =
            visibility ??
            (artwork.visibility === "public" ? "private" : "public");
        startTransition(async () => {
            const res = await updateArtworkVisibilityAction(artwork.id, next);
            if (!res.success) toast.error(res.error || "Failed");
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

    const isAnyDone = artwork.protectionStatus === ProtectionStatus.DONE;
    // Protected = DONE (aligns with UI Badge)
    const isProtected = isAnyDone;
    // Ready = IDLE (Ready to protect)
    const isReady = artwork.protectionStatus === ProtectionStatus.IDLE;

    const isActuallyProcessing =
        artwork.protectionStatus === ProtectionStatus.PROCESSING ||
        artwork.protectionStatus === ProtectionStatus.UPLOADING ||
        artwork.protectionStatus === ProtectionStatus.QUEUED;

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
        handleVisibilityChange,
        isProtected,
        isProcessing,
        isReady,
        isFailed,
        isCanceled,
        isRetrying,
        optimisticStatus,
        artworkId: artwork.id,
        artwork,
    };
}
