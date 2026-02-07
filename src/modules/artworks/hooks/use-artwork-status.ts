import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProtectionStatus, type ProtectionStatusType } from "../models/artwork.enum";

export function useArtworkStatus(artworkId: number, initialStatus: ProtectionStatusType) {
    const [status, setStatus] = useState<ProtectionStatusType>(initialStatus);
    const router = useRouter();
    const [_, startTransition] = useTransition();

    // Sync state with props if props change (e.g. after router.refresh())
    useEffect(() => {
        setStatus(initialStatus);
    }, [initialStatus]);

    useEffect(() => {
        const isProcessing =
            status === ProtectionStatus.QUEUED ||
            status === ProtectionStatus.PENDING ||
            status === ProtectionStatus.PROCESSING ||
            status === ProtectionStatus.RUNNING ||
            status === ProtectionStatus.UPLOADING;

        if (!isProcessing) return;

        console.log(`[Polling] Starting polling for artwork ${artworkId}`);

        const checkStatus = async () => {
            try {
                const res = await fetch(`/api/sse/artwork-status/${artworkId}`);
                if (!res.ok) return;
                const data = (await res.json()) as { status?: ProtectionStatusType | "ERROR" };

                if (data.status && data.status !== "ERROR") {
                    // Only update if changed
                    setStatus((prev) => {
                        if (prev !== data.status) return data.status as ProtectionStatusType;
                        return prev;
                    });

                    // Check for completion
                    const isFinal = 
                        data.status === ProtectionStatus.PROTECTED || 
                        data.status === ProtectionStatus.FAILED || 
                        data.status === ProtectionStatus.CANCELED;

                    if (isFinal) {
                        console.log(`[Polling] Job finished: ${data.status}. Refreshing...`);
                        startTransition(() => {
                            router.refresh();
                        });
                    }
                }
            } catch (e) {
                console.error("[Polling] Error", e);
            }
        };

        // Initial check
        checkStatus();

        // Poll every minute
        const intervalId = setInterval(checkStatus, 60000); 

        return () => {
            clearInterval(intervalId);
        };
    }, [artworkId, initialStatus, status]); 

    return status;
}
