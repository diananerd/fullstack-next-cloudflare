"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // PostHogProvider may not be available at root level — use posthog directly
        posthog.captureException(error, {
            context: "global_error_boundary",
            digest: error.digest,
        });
    }, [error]);

    return (
        <html>
            <body className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center font-sans">
                <h1 className="text-xl font-semibold">Something went wrong</h1>
                <p className="text-sm text-gray-500 max-w-sm">
                    A critical error occurred. Our team has been notified.
                </p>
                <button
                    onClick={reset}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                >
                    Try again
                </button>
            </body>
        </html>
    );
}
