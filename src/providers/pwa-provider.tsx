"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface PWAContextType {
    isInstalled: boolean;
    canInstall: boolean;
    promptInstall: () => Promise<void>;
}

const PWAContext = createContext<PWAContextType>({
    isInstalled: false,
    canInstall: false,
    promptInstall: async () => {},
});

export function PWAProvider({ children }: { children: React.ReactNode }) {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
            if (isStandalone) {
                setIsInstalled(true);
            }
        }

        const handler = (e: Event) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            console.log("Captured PWA install prompt event");
        };

        window.addEventListener("beforeinstallprompt", handler);
        
        const installHandler = () => {
            setIsInstalled(true);
            setDeferredPrompt(null);
            console.log("PWA installed successfully");
        };
        
        window.addEventListener("appinstalled", installHandler);

        return () => {
            window.removeEventListener("beforeinstallprompt", handler);
            window.removeEventListener("appinstalled", installHandler);
        };
    }, []);

    const promptInstall = async () => {
        if (!deferredPrompt) {
            console.log("No deferred prompt available");
            return;
        }
        deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult.outcome === "accepted") {
            console.log("User accepted PWA install");
            setIsInstalled(true);
        } else {
            console.log("User dismissed PWA install");
        }
        setDeferredPrompt(null);
    };

    return (
        <PWAContext.Provider value={{ isInstalled, canInstall: !!deferredPrompt, promptInstall }}>
            {children}
        </PWAContext.Provider>
    );
}

export function usePWA() {
    return useContext(PWAContext);
}
