import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
    ProtectionStatus,
    type ProtectionStatusType,
} from "../models/artwork.enum";

export function useArtworkStatus(
    artworkId: number,
    initialStatus: ProtectionStatusType,
) {
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

        console.log(
            `[Polling V2] Starting polling for artwork ${artworkId} (Status: ${status})`,
        );

        const checkStatus = async () => {
            try {
                // Polling the local API which syncs with Modal on-demand
                const res = await fetch(`/api/artworks/${artworkId}/status`);
                if (!res.ok) {
                    console.error(
                        `[Polling] Failed to fetch status: HTTP ${res.status}`,
                    );
                    return;
                }
                const data = (await res.json()) as {
                    status?: ProtectionStatusType | "ERROR";
                };

                // Only log if interesting or debug
                // console.log(`[Polling] Received status: ${data.status}`);

                if (data.status && data.status !== "ERROR") {
                    // Only update if changed
                    setStatus((prev) => {
                        if (prev !== data.status)
                            return data.status as ProtectionStatusType;
                        return prev;
                    });

                    // Check for completion
                    const isFinal =
                        data.status === ProtectionStatus.PROTECTED ||
                        data.status === ProtectionStatus.FAILED ||
                        data.status === ProtectionStatus.CANCELED;

                    if (isFinal) {
                        console.log(
                            `[Polling] Job finished: ${data.status}. Refreshing...`,
                        );
                        startTransition(() => {
                            router.refresh();
                        });
                    }
                }
            } catch (e) {
                console.error("[Polling] Error", e);
            }
        };

        // Initial check on mount/status change
        checkStatus();

        // Relaxed Polling Strategy:
        // The processing happens asynchronously in the cloud (Modal).
        // We don't need real-time updates. The user can leave and come back.
        // We verify status once per minute to keep the UI eventually consistent if the user stays.
        const intervalId = setInterval(checkStatus, 60000); // 60 seconds

        return () => {
            clearInterval(intervalId);
        };
    }, [artworkId, status, router.refresh]);

    return status;
}
