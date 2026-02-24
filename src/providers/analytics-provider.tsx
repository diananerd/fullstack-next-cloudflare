"use client";

/**
 * PostHog analytics provider for Drimit Shield.
 *
 * Features enabled:
 * - Pageviews (manual, App Router compatible)
 * - User identification via better-auth session
 * - Session replay (passwords masked)
 * - Console log capture in recordings
 * - Web Vitals / performance (FCP, LCP, CLS, FID, TTFB)
 * - Autocapture (clicks, inputs, forms)
 * - Unhandled error capture (window + unhandledrejection)
 * - Surveys (automatic — configured in PostHog UI, no extra code needed)
 */

import posthog from "posthog-js";
import { PostHogProvider, usePostHog } from "posthog-js/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import { authClient } from "@/modules/auth/utils/auth-client";

// ─── Pageview tracker ─────────────────────────────────────────────────────────

function PostHogPageView() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const ph = usePostHog();

    useEffect(() => {
        if (!ph) return;
        const search = searchParams.toString();
        const url =
            window.location.origin + pathname + (search ? `?${search}` : "");
        ph.capture("$pageview", { $current_url: url });
    }, [pathname, searchParams, ph]);

    return null;
}

// ─── User identification ──────────────────────────────────────────────────────

function UserIdentifier() {
    const ph = usePostHog();
    const { data: session, isPending } = authClient.useSession();

    useEffect(() => {
        if (!ph || isPending) return;

        if (session?.user) {
            ph.identify(session.user.id, {
                email: session.user.email,
                name: session.user.name,
            });
        } else {
            ph.reset();
        }
    }, [session, isPending, ph]);

    return null;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
            api_host:
                process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.posthog.com",

            // ── Pageview / navigation ─────────────────────────────────────────
            capture_pageview: false,    // manual via PostHogPageView
            capture_pageleave: true,    // time-on-page signal

            // ── Performance / Web Vitals ──────────────────────────────────────
            // Captures FCP, LCP, FID, CLS, TTFB automatically
            capture_performance: true,

            // ── Session replay ────────────────────────────────────────────────
            session_recording: {
                maskAllInputs: false,
                maskInputOptions: { password: true },
            },

            // ── Console log capture (visible in session replay timeline) ──────
            enable_recording_console_log: true,

            // ── Autocapture ───────────────────────────────────────────────────
            // Captures clicks, form submits, input changes automatically.
            // Disable on sensitive inputs with data-ph-no-capture attribute.
            autocapture: true,

            loaded: (ph) => {
                if (process.env.NODE_ENV === "development") ph.debug();
            },
        });

        // ── Global unhandled error capture ────────────────────────────────────
        // Catches runtime JS errors and unhandled promise rejections.
        // Component-level errors are caught by error boundaries instead.
        const handleError = (event: ErrorEvent) => {
            posthog.captureException(event.error ?? new Error(event.message), {
                context: "window_error",
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
            });
        };

        const handleRejection = (event: PromiseRejectionEvent) => {
            const err =
                event.reason instanceof Error
                    ? event.reason
                    : new Error(String(event.reason));
            posthog.captureException(err, { context: "unhandled_rejection" });
        };

        window.addEventListener("error", handleError);
        window.addEventListener("unhandledrejection", handleRejection);

        return () => {
            window.removeEventListener("error", handleError);
            window.removeEventListener("unhandledrejection", handleRejection);
        };
    }, []);

    return (
        <PostHogProvider client={posthog}>
            <Suspense>
                <PostHogPageView />
            </Suspense>
            <UserIdentifier />
            {children}
        </PostHogProvider>
    );
}
