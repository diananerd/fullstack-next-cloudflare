"use client";

import { Download, FileIcon, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Artwork } from "../schemas/artwork.schema";

interface DownloadArtworkDialogProps {
    artwork: Artwork;
    children?: React.ReactNode;
}

export function DownloadArtworkDialog({
    artwork,
    children,
}: DownloadArtworkDialogProps) {
    const [open, setOpen] = useState(false);
    const variants = (artwork.metadata as any)?.variants || [];
    
    // Initial selection: All variants
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    
    // Reset selection when opening
    const onOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (isOpen) {
             const allIds = variants.map((v: any) => v.id);
             // Maybe include original? User said "generated variants". 
             // Let's stick to variants for now as requested.
             setSelectedIds(allIds);
        }
    };

    const toggleSelection = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds((prev) => [...prev, id]);
        } else {
            setSelectedIds((prev) => prev.filter((i) => i !== id));
        }
    };

    const handleDownload = async () => {
        if (selectedIds.length === 0) {
            toast.error("Please select at least one item to download.");
            return;
        }

        toast.loading(`Starting download for ${selectedIds.length} items...`, { id: "dl-start" });

        // Helper to get URL
        const getUrl = (v: any) => {
             // Prefer key-based proxy for authenticated access
             if (v.key) {
                 try {
                     const parts = v.key.split("/");
                     if (parts.length > 0) {
                         const hash = parts[0];
                         const filename = v.key.replace(`${hash}/`, '');
                         return `/api/assets/${hash}/${filename}`;
                     }
                 } catch(e) { console.error("Error parsing variant key", e) }
             }

             // Fallback: Infer from parent artwork structure
             if (!v.url && artwork.r2Key && v.method) {
                try {
                    const parts = artwork.r2Key.split("/");
                    if (parts.length > 1) {
                        const hash = parts[0]; 
                        let filename = "";
                        if (v.method === "mist") filename = "mist-v2.png";
                        else if (v.method === "grayscale") filename = "grayscale.png";
                        else if (v.method === "watermark") filename = "watermark.png";
                        
                        if (filename) return `/api/assets/${hash}/${filename}`;
                    }
                } catch(e) {}
             }

             if (v.url) return v.url;
             return "";
        };

        // Trigger downloads
        let count = 0;
        for (const variantId of selectedIds) {
            const variant = variants.find((v: any) => v.id === variantId);
            if (!variant) continue;

            const url = getUrl(variant);
            if (!url) continue;

            const safeTitle = (artwork.title || "artwork")
                .replace(/[^a-z0-9]/gi, "_")
                .toLowerCase();
            const filename = `${safeTitle}_${variant.method || 'protected'}_${count}.png`; // fallback ext

            try {
                // Fetch blob to force download behavior
                const response = await fetch(url);
                const blob = await response.blob();
                const blobUrl = window.URL.createObjectURL(blob);
                
                const link = document.createElement("a");
                link.href = blobUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
                
                count++;
            } catch (e) {
                console.error("Download failed for", variantId, e);
            }
        }

        toast.success(`Started ${count} downloads`, { id: "dl-start" });
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                {children || (
                    <Button variant="secondary" size="icon">
                        <Download className="h-4 w-4" />
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Download Variants</DialogTitle>
                    <DialogDescription>
                        Select the processed versions you want to download.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[300px] border rounded-md p-4">
                     <div className="flex flex-col gap-3">
                        {variants.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">No variants generated yet.</p>
                        )}
                        {variants.map((variant: any) => (
                            <div key={variant.id} className="flex items-center space-x-3 p-2 hover:bg-zinc-100 rounded">
                                <Checkbox 
                                    id={variant.id} 
                                    checked={selectedIds.includes(variant.id)}
                                    onCheckedChange={(c) => toggleSelection(variant.id, c as boolean)}
                                />
                                <div className="grid gap-1.5 leading-none">
                                    <Label
                                        htmlFor={variant.id}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                    >
                                        {variant.method ? (variant.method.charAt(0).toUpperCase() + variant.method.slice(1)) : "Variant"}
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        Generated on {new Date(variant.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        ))}
                     </div>
                </ScrollArea>

                <DialogFooter className="sm:justify-end">
                    <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleDownload} disabled={variants.length === 0}>
                        Download Selected
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
