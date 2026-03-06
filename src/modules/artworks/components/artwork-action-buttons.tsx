import {
    Download,
    Loader2,
    Settings2,
    Shield,
    Trash2,
    XCircle,
} from "lucide-react";
import { useState } from "react";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FEATURES } from "@/constants/features.constant";
import { cn } from "@/lib/utils";
import type { useArtworkActions } from "../hooks/use-artwork-actions";
import { ArtworkShareDialog } from "./artwork-share-dialog";
import { ProtectArtworkDialog } from "./protect-artwork-dialog";

interface ArtworkActionButtonsProps {
    actions: ReturnType<typeof useArtworkActions>;
    hideCancel?: boolean;
    hideRetry?: boolean;
    children?: React.ReactNode;
}

export function ArtworkActionButtons(props: ArtworkActionButtonsProps) {
    const { actions, children } = props;
    const {
        isPending,
        isProtected,
        isProcessing,
        deleteOpen,
        setDeleteOpen,
        executeDelete,
        handleDownload,
        handleCancel,
        artworkId,
        artwork,
    } = actions;

    const { hideCancel = false } = props;

    const [shareOpen, setShareOpen] = useState(false);

    const onDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setDeleteOpen(true);
    };

    const stopProp = (e: React.MouseEvent) => e.stopPropagation();

    const canDownload = true;

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
                {/* Download Action — always visible */}
                {canDownload && (
                    <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-black/60 hover:bg-indigo-500/80 text-white rounded-full border-0 shadow-sm"
                        onClick={handleDownload}
                        disabled={isPending}
                        title={
                            isProtected
                                ? "Download Protected"
                                : "Download Original"
                        }
                    >
                        <Download className="h-3.5 w-3.5" />
                    </Button>
                )}

                {/* Share / Edit Details */}
                {FEATURES.share && (
                    <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-black/60 hover:bg-indigo-500/80 text-white rounded-full border-0 shadow-sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShareOpen(true);
                        }}
                        disabled={isPending}
                        title="Share & Edit Details"
                    >
                        <Settings2 className="h-3.5 w-3.5" />
                    </Button>
                )}

                {/* Shield service UI — gated behind FEATURES.shield */}
                {FEATURES.shield && (
                    <>
                        {/* Protect Action (Always available to allow Reprocess) */}
                        <ProtectArtworkDialog artworkId={artworkId}>
                            <Button
                                variant="secondary"
                                size="icon"
                                className={cn(
                                    "h-7 w-7 text-white rounded-full border-0 shadow-sm",
                                    "bg-black/60 hover:bg-indigo-500/80",
                                    isProcessing &&
                                        "opacity-50 cursor-not-allowed",
                                )}
                                onClick={stopProp}
                                disabled={isPending || isProcessing}
                                title={
                                    isProcessing
                                        ? "Processing..."
                                        : canDownload
                                          ? "Reprocess"
                                          : "Protect"
                                }
                            >
                                {isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Shield className="h-3.5 w-3.5" />
                                )}
                            </Button>
                        </ProtectArtworkDialog>

                        {/* Cancel Button (While Processing) */}
                        {isProcessing && !hideCancel && (
                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-7 w-7 bg-black/60 hover:bg-orange-500/80 text-white rounded-full border-0 shadow-sm"
                                onClick={handleCancel}
                                disabled={isPending}
                                title="Cancel Protection"
                            >
                                <XCircle className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </>
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

            <ArtworkShareDialog
                artwork={artwork}
                open={shareOpen}
                onOpenChange={setShareOpen}
            />

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
