import { Download, Loader2, Shield, Trash2 } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
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
import { DownloadArtworkDialog } from "./download-artwork-dialog";

interface ArtworkActionButtonsProps {
    actions: ReturnType<typeof useArtworkActions>;
    hideCancel?: boolean;
    hideRetry?: boolean;
}

export function ArtworkActionButtons({
    actions,
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

    // Check for variants safely
    const hasVariants = (artwork.metadata as any)?.variants?.length > 0;
    // Allow download if officially protected OR if we have variants (even if currently processing a new one)
    const canDownload = isProtected || hasVariants;

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
                            isProcessing && "opacity-50 cursor-not-allowed"
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
                    <DownloadArtworkDialog artwork={artwork}>
                        <Button
                            variant="secondary"
                            size="icon"
                            className="h-7 w-7 bg-black/60 hover:bg-indigo-500/80 text-white rounded-full border-0 shadow-sm"
                            onClick={stopProp}
                            disabled={isPending}
                            title="Download Variants"
                        >
                            <Download className="h-3.5 w-3.5" />
                        </Button>
                    </DownloadArtworkDialog>
                )}

                {/* Delete Button */}
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
            </div>

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent onClick={stopProp}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Are you absolutely sure?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently
                            delete the artwork and remove the data from our
                            servers.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={stopProp}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                stopProp(e);
                                executeDelete();
                            }}
                            className="bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
