"use client";

import {
    Bookmark,
    Download,
    FolderInput,
    Globe,
    Link2,
    Loader2,
    Lock,
    Shield,
    Trash2,
    XCircle,
} from "lucide-react";
import { toast } from "react-hot-toast";
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
    currentCollectionId?: string | null;
    /** Profile base path for share URL, e.g. "/@username". */
    profilePath?: string;
    children?: React.ReactNode;
}

export function ArtworkActionButtons({
    actions,
    currentCollectionId,
    profilePath,
    children,
}: ArtworkActionButtonsProps) {
    const {
        isPending,
        isProcessing,
        deleteOpen,
        setDeleteOpen,
        executeDelete,
        handleDownload,
        handleCancel,
        handleVisibilityChange,
        artwork,
    } = actions;

    const [protectOpen, setProtectOpen] = useState(false);
    const [moveOpen, setMoveOpen] = useState(false);
    const [saveOpen, setSaveOpen] = useState(false);

    const stopProp = (e: React.MouseEvent) => e.stopPropagation();

    const handleDeleteConfirm = (e: React.MouseEvent) => {
        e.stopPropagation();
        executeDelete();
    };

    const handleShare = (e: React.MouseEvent) => {
        e.stopPropagation();
        const r2KeyParts = (artwork.r2Key ?? "").split("/");
        const artworkHash =
            r2KeyParts.length >= 2
                ? r2KeyParts[r2KeyParts.length - 2]
                : r2KeyParts[0];
        const base = profilePath ?? "";
        const url = `${window.location.origin}${base}?artwork=${artworkHash}`;
        navigator.clipboard.writeText(url).then(
            () => toast.success("Link copied"),
            () => toast.error("Could not copy link"),
        );
    };

    const btn =
        "h-7 w-7 flex items-center justify-center rounded-full bg-black/30 text-white/80 hover:bg-black/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

    return (
        <>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: action container */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: action container */}
            <div
                className="pointer-events-auto flex items-center gap-1"
                onClick={stopProp}
            >
                {FEATURES.shield &&
                    (isProcessing ? (
                        <button
                            type="button"
                            title="Cancel protection"
                            onClick={(e) => { e.stopPropagation(); handleCancel(e); }}
                            disabled={isPending}
                            className={btn}
                        >
                            <XCircle className="h-4 w-4 text-orange-300" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            title={artwork.protectionStatus === "done" ? "Reprocess" : "Protect"}
                            onClick={(e) => { e.stopPropagation(); setProtectOpen(true); }}
                            disabled={isPending}
                            className={btn}
                        >
                            <Shield className="h-4 w-4" />
                        </button>
                    ))}

                <button
                    type="button"
                    title="Save to board"
                    onClick={(e) => { e.stopPropagation(); setSaveOpen(true); }}
                    disabled={isPending}
                    className={btn}
                >
                    <Bookmark className="h-4 w-4" />
                </button>

                <button
                    type="button"
                    title="Move to folder"
                    onClick={(e) => { e.stopPropagation(); setMoveOpen(true); }}
                    disabled={isPending}
                    className={btn}
                >
                    <FolderInput className="h-4 w-4" />
                </button>

                <button
                    type="button"
                    title={artwork.visibility === "public" ? "Make private" : "Make public"}
                    onClick={(e) => { e.stopPropagation(); handleVisibilityChange(e); }}
                    disabled={isPending}
                    className={btn}
                >
                    {artwork.visibility === "public" ? (
                        <Globe className="h-4 w-4" />
                    ) : (
                        <Lock className="h-4 w-4" />
                    )}
                </button>

                <button
                    type="button"
                    title="Download"
                    onClick={(e) => { e.stopPropagation(); handleDownload(e); }}
                    disabled={isPending}
                    className={btn}
                >
                    <Download className="h-4 w-4" />
                </button>

                <button
                    type="button"
                    title="Share"
                    onClick={handleShare}
                    className={btn}
                >
                    <Link2 className="h-4 w-4" />
                </button>

                <button
                    type="button"
                    title="Delete"
                    onClick={(e) => { e.stopPropagation(); setDeleteOpen(true); }}
                    disabled={isPending}
                    className="h-7 w-7 flex items-center justify-center rounded-full bg-black/30 text-red-400 hover:bg-red-500/40 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Trash2 className="h-4 w-4" />
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
                mode="save"
                artworkId={artwork.id}
                open={saveOpen}
                onOpenChange={setSaveOpen}
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
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently
                            delete the artwork and its protected variants from
                            our servers.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteConfirm}
                            disabled={isPending}
                        >
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Delete
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
