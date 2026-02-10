import { Download, Loader2, Shield, Trash2 } from "lucide-react";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { useArtworkActions } from "../hooks/use-artwork-actions";
import { ProtectArtworkDialog } from "./protect-artwork-dialog";

interface ArtworkActionButtonsProps {
    actions: ReturnType<typeof useArtworkActions>;
    hideCancel?: boolean;
    hideRetry?: boolean;
    children?: React.ReactNode;
}

export function ArtworkActionButtons({
    actions,
    children,
}: ArtworkActionButtonsProps) {
    const {
        isPending,
        isProtected,
        isProcessing,
        deleteOpen,
        setDeleteOpen,
        executeDelete,
        artworkId,
        artwork,
    } = actions;

    const onDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setDeleteOpen(true);
    };

    const stopProp = (e: React.MouseEvent) => e.stopPropagation();

    // Check for protected status
    const canDownload = isProtected;

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!artwork.r2Key) return;
        const hash = artwork.r2Key.split("/")[0];
        const url = `/api/assets/${hash}/protected.png`;

        const link = document.createElement("a");
        link.href = url;
        link.download = `drimit-ai-shield-${hash}-protected.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDeleteConfirm = (e: React.MouseEvent) => {
        e.stopPropagation();
        executeDelete();
    };

    return (
        <>
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: Stop propagation helper */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: Stop propagation helper */}
            <div
                className="flex gap-1.5 pointer-events-auto items-center"
                onClick={stopProp}
            >
                {/* Protect Button - Always visible unless busy */}
                <ProtectArtworkDialog artworkId={artworkId}>
                    <Button
                        variant="secondary"
                        size="icon"
                        className={cn(
                            "h-7 w-7 text-white rounded-full border-0 shadow-sm",
                            "bg-black/60 hover:bg-indigo-500/80",
                            isProcessing && "opacity-50 cursor-not-allowed",
                        )}
                        onClick={stopProp}
                        disabled={isPending || isProcessing}
                        title={isProcessing ? "Processing..." : "Protect"}
                    >
                        {isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Shield className="h-3.5 w-3.5" />
                        )}
                    </Button>
                </ProtectArtworkDialog>

                {/* Download Button */}
                {canDownload && (
                    <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-black/60 hover:bg-indigo-500/80 text-white rounded-full border-0 shadow-sm"
                        onClick={handleDownload}
                        disabled={isPending}
                        title="Download Protected"
                    >
                        <Download className="h-3.5 w-3.5" />
                    </Button>
                )}

                {/* Delete Button */}
                {!isProcessing && (
                    <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-black/60 hover:bg-red-500/80 text-white rounded-full border-0 shadow-sm"
                        onClick={onDeleteClick}
                        disabled={isPending}
                        title="Delete"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                )}

                {/* Custom Actions (e.g. Close in Full View) */}
                {children}
            </div>

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent onClick={stopProp}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Are you absolutely sure?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently
                            delete the artwork and its protected variants from
                            our servers.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteConfirm}
                            disabled={isPending}
                        >
                            {isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Delete
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
