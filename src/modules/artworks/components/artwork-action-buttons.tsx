import { Download, RefreshCcw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useArtworkActions } from "../hooks/use-artwork-actions";

interface ArtworkActionButtonsProps {
    actions: ReturnType<typeof useArtworkActions>;
}

export function ArtworkActionButtons({ actions }: ArtworkActionButtonsProps) {
    const {
        isPending,
        isProtected,
        isProcessing,
        isFailed,
        isCanceled,
        handleCancel,
        handleDownload,
        handleRetry,
        deleteOpen,
        setDeleteOpen,
        executeDelete,
    } = actions;

    const onDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setDeleteOpen(true);
    };

    const stopProp = (e: React.MouseEvent) => e.stopPropagation();

    return (
        <>
            <div
                className="flex gap-1.5 pointer-events-auto"
                onClick={stopProp}
            >
                {isProcessing && (
                    <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-black/60 hover:bg-red-500/80 text-white rounded-full border-0 shadow-sm"
                        onClick={handleCancel}
                        disabled={isPending}
                        title="Cancel"
                    >
                        <XCircle className="h-4 w-4" />
                    </Button>
                )}
                {isProtected && (
                    <>
                        <Button
                            variant="secondary"
                            size="icon"
                            className="h-7 w-7 bg-black/60 hover:bg-indigo-500/80 text-white rounded-full border-0 shadow-sm"
                            onClick={handleDownload}
                            disabled={isPending}
                            title="Download"
                        >
                            <Download className="h-3.5 w-3.5" />
                        </Button>
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
                    </>
                )}
                {(isFailed || isCanceled) && (
                    <>
                        <Button
                            variant="secondary"
                            size="icon"
                            className="h-7 w-7 bg-black/60 hover:bg-blue-500/80 text-white rounded-full border-0 shadow-sm"
                            onClick={handleRetry}
                            disabled={isPending}
                            title="Retry"
                        >
                            <RefreshCcw className="h-3.5 w-3.5" />
                        </Button>
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
                    </>
                )}
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
