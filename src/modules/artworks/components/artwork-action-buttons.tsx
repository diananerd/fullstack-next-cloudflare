"use client";

import {
    Ban,
    Download,
    Eye,
    EyeOff,
    Loader2,
    MoreVertical,
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
import type { useArtworkActions } from "../hooks/use-artwork-actions";
import { ProtectArtworkDialog } from "./protect-artwork-dialog";

interface ArtworkActionButtonsProps {
    actions: ReturnType<typeof useArtworkActions>;
    children?: React.ReactNode;
}

export function ArtworkActionButtons({
    actions,
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

    const [menuOpen, setMenuOpen] = useState(false);
    const [protectOpen, setProtectOpen] = useState(false);

    const stopProp = (e: React.MouseEvent) => e.stopPropagation();

    const handleDeleteConfirm = (e: React.MouseEvent) => {
        e.stopPropagation();
        executeDelete();
    };

    return (
        <>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: action container */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: action container */}
            <div className="pointer-events-auto relative" onClick={stopProp}>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen((v) => !v);
                    }}
                    className="h-6 w-6 flex items-center justify-center rounded-md bg-black/30 text-white/80 hover:bg-black/50 transition-colors opacity-0 group-hover:opacity-100"
                    aria-label="Artwork options"
                    disabled={isPending}
                >
                    {isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <MoreVertical className="h-3.5 w-3.5" />
                    )}
                </button>

                {menuOpen && (
                    <>
                        {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop */}
                        {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop */}
                        <div
                            className="fixed inset-0 z-10"
                            onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpen(false);
                            }}
                        />
                        <div className="absolute top-full right-0 mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-lg py-1 z-20 text-sm">
                            {FEATURES.shield &&
                                (isProcessing ? (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMenuOpen(false);
                                            handleCancel(e);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-orange-600 hover:bg-orange-50 text-left"
                                    >
                                        <XCircle className="h-3.5 w-3.5" />
                                        Cancel protection
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMenuOpen(false);
                                            setProtectOpen(true);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50 text-left"
                                    >
                                        <Shield className="h-3.5 w-3.5" />
                                        {artwork.protectionStatus === "done"
                                            ? "Reprocess"
                                            : "Protect"}
                                    </button>
                                ))}

                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuOpen(false);
                                    handleDownload(e);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50 text-left"
                            >
                                <Download className="h-3.5 w-3.5" />
                                Download
                            </button>

                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuOpen(false);
                                    handleVisibilityChange(e);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50 text-left"
                            >
                                {artwork.visibility === "public" ? (
                                    <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                    <Eye className="h-3.5 w-3.5" />
                                )}
                                {artwork.visibility === "public"
                                    ? "Make private"
                                    : "Make public"}
                            </button>

                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuOpen(false);
                                    handleDownloadableToggle(e);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50 text-left"
                            >
                                {artwork.allowDownload ? (
                                    <Ban className="h-3.5 w-3.5" />
                                ) : (
                                    <Download className="h-3.5 w-3.5" />
                                )}
                                {artwork.allowDownload
                                    ? "Disable download"
                                    : "Allow download"}
                            </button>

                            <div className="border-t border-gray-100 my-1" />

                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuOpen(false);
                                    setDeleteOpen(true);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 text-left"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                            </button>
                        </div>
                    </>
                )}

                {children}
            </div>

            <ProtectArtworkDialog
                artworkId={artwork.id}
                open={protectOpen}
                onOpenChange={setProtectOpen}
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
