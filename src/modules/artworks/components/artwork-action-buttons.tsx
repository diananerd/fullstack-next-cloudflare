"use client";

import {
    Ban,
    Download,
    Eye,
    EyeOff,
    FolderInput,
    Loader2,
    Shield,
    Trash2,
    XCircle,
} from "lucide-react";
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
import type { useArtworkActions } from "../hooks/use-artwork-actions";
import { CollectionPickerDialog } from "./collection-picker-dialog";
import { ProtectArtworkDialog } from "./protect-artwork-dialog";
import { useState } from "react";

interface ArtworkActionButtonsProps {
    actions: ReturnType<typeof useArtworkActions>;
    /** Current parent collection ID, if the artwork is inside a collection. */
    currentCollectionId?: string | null;
    children?: React.ReactNode;
}

export function ArtworkActionButtons({
    actions,
    currentCollectionId,
    children,
}: ArtworkActionButtonsProps) {
    const {
        isPending,
        isProcessing,
        deleteOpen,
        setDeleteOpen,
        executeDelete,
        handleDownload,
        handleDownloadableToggle,
        handleCancel,
        handleVisibilityChange,
        artwork,
    } = actions;

    const [protectOpen, setProtectOpen] = useState(false);
    const [moveOpen, setMoveOpen] = useState(false);

    const stopProp = (e: React.MouseEvent) => e.stopPropagation();

    const handleDeleteConfirm = (e: React.MouseEvent) => {
        e.stopPropagation();
        executeDelete();
    };

    const btnBase =
        "h-6 w-6 flex items-center justify-center rounded-md bg-black/30 text-white/80 hover:bg-black/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

    return (
        <>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: action container */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: action container */}
            <div
                className="pointer-events-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={stopProp}
            >
                {FEATURES.shield &&
                    (isProcessing ? (
                        <button
                            type="button"
                            title="Cancel protection"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleCancel(e);
                            }}
                            disabled={isPending}
                            className={btnBase}
                        >
                            <XCircle className="h-3 w-3 text-orange-300" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            title={artwork.protectionStatus === "done" ? "Reprocess" : "Protect"}
                            onClick={(e) => {
                                e.stopPropagation();
                                setProtectOpen(true);
                            }}
                            disabled={isPending}
                            className={btnBase}
                        >
                            <Shield className="h-3 w-3" />
                        </button>
                    ))}

                <button
                    type="button"
                    title="Move to folder"
                    onClick={(e) => {
                        e.stopPropagation();
                        setMoveOpen(true);
                    }}
                    disabled={isPending}
                    className={btnBase}
                >
                    <FolderInput className="h-3 w-3" />
                </button>

                <button
                    type="button"
                    title={artwork.visibility === "public" ? "Make private" : "Make public"}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleVisibilityChange(e);
                    }}
                    disabled={isPending}
                    className={btnBase}
                >
                    {artwork.visibility === "public" ? (
                        <EyeOff className="h-3 w-3" />
                    ) : (
                        <Eye className="h-3 w-3" />
                    )}
                </button>

                <button
                    type="button"
                    title="Download"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(e);
                    }}
                    disabled={isPending}
                    className={btnBase}
                >
                    <Download className="h-3 w-3" />
                </button>

                <button
                    type="button"
                    title={artwork.allowDownload ? "Disable download" : "Allow download"}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadableToggle(e);
                    }}
                    disabled={isPending}
                    className={btnBase}
                >
                    {artwork.allowDownload ? (
                        <Ban className="h-3 w-3" />
                    ) : (
                        <Download className="h-3 w-3 text-green-400" />
                    )}
                </button>

                <button
                    type="button"
                    title="Delete"
                    onClick={(e) => {
                        e.stopPropagation();
                        setDeleteOpen(true);
                    }}
                    disabled={isPending}
                    className="h-6 w-6 flex items-center justify-center rounded-md bg-black/30 text-red-400 hover:bg-red-500/40 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <Trash2 className="h-3 w-3" />
                    )}
                </button>

                {children}
            </div>

            <ProtectArtworkDialog
                artworkId={artwork.id}
                open={protectOpen}
                onOpenChange={setProtectOpen}
            />

            <CollectionPickerDialog
                mode="move"
                itemId={artwork.id}
                currentCollectionId={currentCollectionId}
                open={moveOpen}
                onOpenChange={setMoveOpen}
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
