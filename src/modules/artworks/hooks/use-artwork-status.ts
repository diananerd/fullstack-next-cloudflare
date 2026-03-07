import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
    ProtectionStatus,
    type ProtectionStatusType,
} from "../models/artwork.enum";

export type ProgressData = {
    status: string;
    currentStep?: string;
    steps?: any[];
    error?: string;
    shieldScore?: number;
    total_duration_ms?: number;
};

export function useArtworkStatus(
    artworkId: string,
    initialStatus: ProtectionStatusType,
) {
    const [status, setStatus] = useState<ProtectionStatusType>(initialStatus);
    const [progress, setProgress] = useState<ProgressData | null>(null);
    const router = useRouter();
    const [_, startTransition] = useTransition();

    // Sync state with props if props change (e.g. after router.refresh())
    useEffect(() => {
        setStatus(initialStatus);
    }, [initialStatus]);

    useEffect(() => {
        // V2: Always fetch status on mount to get the detailed job result (steps, logs) even if completed.
        // Then only poll if processing.

        let isActive = true;
        const checkStatus = async () => {
            if (!isActive) return;

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
                    progress?: ProgressData;
                };

                if (!isActive) return;

                if (data.progress) {
                    setProgress(data.progress);
                }

                if (data.status && data.status !== "ERROR") {
                    setStatus((prev) => {
                        if (prev !== data.status)
                            return data.status as ProtectionStatusType;
                        return prev;
                    });

                    const isFinal =
                        data.status === ProtectionStatus.DONE ||
                        data.status === ProtectionStatus.FAILED ||
                        data.status === ProtectionStatus.CANCELED;

                    // If status CHANGED to final, refresh router
                    if (isFinal && status !== data.status) {
                        startTransition(() => {
                            router.refresh();
                        });
                    }
                }
            } catch (e) {
                console.error("[Polling] Error", e);
            }
        };

        // Initial fetch
        checkStatus();

        const isProcessing =
            status === ProtectionStatus.QUEUED ||
            status === ProtectionStatus.PROCESSING ||
            status === ProtectionStatus.UPLOADING;

        let intervalId: NodeJS.Timeout;
        if (isProcessing) {
            intervalId = setInterval(checkStatus, 15000);
        }

        return () => {
            isActive = false;
            if (intervalId) clearInterval(intervalId);
        };
    }, [artworkId, status]); // Removed dependency on router to avoid loops

    return { status, progress };
}
