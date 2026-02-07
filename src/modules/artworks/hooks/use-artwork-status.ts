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

        console.log(`[SSE] Connecting for artwork ${artworkId}`);
        const eventSource = new EventSource(`/api/sse/artwork-status/${artworkId}`);

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.status && data.status !== "ERROR") {
                    // Only update if changed
                    setStatus((prev) => {
                        if (prev !== data.status) return data.status;
                        return prev;
                    });

                    // Check for completion
                    const isFinal = 
                        data.status === ProtectionStatus.PROTECTED || 
                        data.status === ProtectionStatus.FAILED || 
                        data.status === ProtectionStatus.CANCELED;

                    if (isFinal) {
                        console.log(`[SSE] Job finished: ${data.status}. Refreshing...`);
                        eventSource.close();
                        startTransition(() => {
                            router.refresh();
                        });
                    }
                }
            } catch (e) {
                console.error("[SSE] Parse error", e);
            }
        };

        eventSource.onerror = (e) => {
            // EventSource automatically retries on connection loss.
            // We only close on explicit error if needed, but for now let it retry.
            // But if it's a 404 or 401, the browser usually closes it.
            // valid connection state: 0=connecting, 1=open, 2=closed
            if (eventSource.readyState === 2) { 
                console.log("[SSE] Connection closed by server or network error.");
            }
        };

        return () => {
            eventSource.close();
        };
        // We only want to restart if artworkId changes.
        // If status changes (e.g. QUEUED -> PROCESSING), we don't need to reconnect,
        // the stream just keeps sending the new status.
        // So we do NOT include 'status' in dependency array.
        // But we need to verify if 'isProcessing' check at the top relies on stale closure.
        // NO, because we only start the effect if INITIAL status (or current state) implies processing at mount.
        // Wait, if we use Query/State, we need to be careful.
    }, [artworkId, initialStatus]); // Added initialStatus to reset if we navigate or hard refresh

    return status;
}
