"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/modules/auth/utils/auth-client";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Gift } from "lucide-react";

export function WelcomeModal() {
    const { data: session } = authClient.useSession();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!session?.user) return;
        const user = session.user as { id: string; createdAt?: string | Date };
        if (!user.createdAt) return;
        const ageMs = Date.now() - new Date(user.createdAt).getTime();
        const seen = localStorage.getItem(`welcome_seen_${user.id}`) === "true";
        if (ageMs < 10 * 60 * 1000 && !seen) setOpen(true);
    }, [session]);

    const dismiss = () => {
        const user = session?.user as { id?: string } | undefined;
        if (user?.id) localStorage.setItem(`welcome_seen_${user.id}`, "true");
        setOpen(false);
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) dismiss();
            }}
        >
            <DialogContent className="sm:max-w-sm text-center">
                <DialogHeader className="items-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600 mb-2">
                        <Gift className="h-8 w-8" />
                    </div>
                    <DialogTitle className="text-xl font-bold">
                        Welcome to Drimit
                    </DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground mt-1">
                        You&apos;ve got{" "}
                        <strong className="text-foreground">
                            $5.00 in credits
                        </strong>{" "}
                        on us. Spend them however you like on Drimit.
                    </DialogDescription>
                </DialogHeader>
                <Button onClick={dismiss} className="w-full mt-2">
                    Let&apos;s go
                </Button>
            </DialogContent>
        </Dialog>
    );
}
