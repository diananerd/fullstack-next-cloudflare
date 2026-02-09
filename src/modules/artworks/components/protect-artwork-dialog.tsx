"use client";

import { useState, useTransition } from "react";
import { toast } from "react-hot-toast";
import { Loader2, ShieldCheck, Wand2, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ProtectionMethod, type ProtectionMethodType } from "@/modules/artworks/models/artwork.enum";
import { protectArtworkAction } from "../actions/protect-artwork.action";

interface ProtectArtworkDialogProps {
    artworkId: number;
    currentStatus?: string;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
}

const PROTECTION_OPTIONS = [
    {
        value: ProtectionMethod.MIST,
        label: "Mist V2 (Adversarial)",
        description: "Protects against AI mimicry (Style Transfer / LoRA) using adversarial noise.",
        icon: ShieldCheck,
    },
    {
        value: ProtectionMethod.GRAYSCALE,
        label: "B&W Conversion",
        description: "Converts the image to grayscale. Simple processing test.",
        icon: Wand2,
    },
    {
        value: ProtectionMethod.WATERMARK,
        label: "Visible Watermark",
        description: "Overlays a visible 'DRIMIT SHIELD' watermark pattern.",
        icon: Droplets,
    },
];

export function ProtectArtworkDialog({
    artworkId,
    children,
}: ProtectArtworkDialogProps) {
    const [open, setOpen] = useState(false);
    const [method, setMethod] = useState<ProtectionMethodType>(ProtectionMethod.MIST);
    const [isPending, startTransition] = useTransition();

    const handleProtect = () => {
        startTransition(async () => {
            const result = await protectArtworkAction({
                artworkId,
                method,
            });

            if (result.success) {
                toast.success("Protection job started!");
                setOpen(false);
            } else {
                toast.error(result.error || "Failed to start protection");
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children || <Button>Protect</Button>}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Protect Artwork</DialogTitle>
                    <DialogDescription>
                        Choose a protection method to apply to this artwork.
                        This process happens in the background.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="method">Protection Method</Label>
                        <Select
                            value={method}
                            onValueChange={(val) => setMethod(val as ProtectionMethodType)}
                            disabled={isPending}
                        >
                            <SelectTrigger id="method">
                                <SelectValue placeholder="Select method" />
                            </SelectTrigger>
                            <SelectContent>
                                {PROTECTION_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        <div className="flex items-center gap-2">
                                            <opt.icon className="h-4 w-4 text-muted-foreground" />
                                            <span>{opt.label}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground mt-1">
                            {PROTECTION_OPTIONS.find((o) => o.value === method)?.description}
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => setOpen(false)}
                        disabled={isPending}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleProtect} disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Start Processing
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
