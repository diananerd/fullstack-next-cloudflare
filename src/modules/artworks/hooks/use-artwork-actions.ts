import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
    deleteArtworkAction,
    cancelProtectionAction,
    retryProtectionAction,
} from "../actions/manage-artwork.actions";
import { Artwork } from "../schemas/artwork.schema";
import { ProtectionStatus } from "../models/artwork.enum";

export function useArtworkActions(artwork: Artwork) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [deleteOpen, setDeleteOpen] = useState(false);

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
        startTransition(async () => {
            const res = await retryProtectionAction(artwork.id);
            if (res.success) toast.success("Retrying protection");
            else toast.error(res.error || "Failed");
        });
    };

    const isProtected = artwork.protectionStatus === ProtectionStatus.PROTECTED;
    const isProcessing =
        artwork.protectionStatus === ProtectionStatus.PENDING ||
        artwork.protectionStatus === ProtectionStatus.PROCESSING;
    const isFailed = artwork.protectionStatus === ProtectionStatus.FAILED;
    const isCanceled = artwork.protectionStatus === ProtectionStatus.CANCELED;

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
    };
}
