"use client";

import { useEffect } from "react";
import { usePostHog } from "posthog-js/react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const ph = usePostHog();

    useEffect(() => {
        ph?.captureException(error, {
            context: "dashboard_error_boundary",
            digest: error.digest,
        });
    }, [error, ph]);

    return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
                An unexpected error occurred. Our team has been notified.
            </p>
            <Button onClick={reset} variant="outline" size="sm">
                Try again
            </Button>
        </div>
    );
}
