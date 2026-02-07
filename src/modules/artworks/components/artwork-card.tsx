"use client";

import { Check, Edit, ImageIcon, MoreHorizontal, Shield, Trash2, Download, RefreshCcw, XCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
import { ProtectionStatus } from "@/modules/artworks/models/artwork.enum";
import { Artwork } from "@/modules/artworks/schemas/artwork.schema";
import { cn } from "@/lib/utils";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
    deleteArtworkAction, 
    cancelProtectionAction, 
    retryProtectionAction 
} from "../actions/manage-artwork.actions";
import { toast } from "react-hot-toast";

interface ArtworkCardProps {
    artwork: Artwork;
}

const statusColors = {
    [ProtectionStatus.PENDING]: "text-yellow-400",
    [ProtectionStatus.PROCESSING]: "text-blue-400",
    [ProtectionStatus.PROTECTED]: "text-green-400",
    [ProtectionStatus.FAILED]: "text-red-400",
    [ProtectionStatus.CANCELED]: "text-gray-400",
};

export function ArtworkCard({ artwork }: ArtworkCardProps) {
    const isProtected = artwork.protectionStatus === ProtectionStatus.PROTECTED;
    const isProcessing = artwork.protectionStatus === ProtectionStatus.PENDING || artwork.protectionStatus === ProtectionStatus.PROCESSING;
    const isFailed = artwork.protectionStatus === ProtectionStatus.FAILED;
    const isCanceled = artwork.protectionStatus === ProtectionStatus.CANCELED;

    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [deleteOpen, setDeleteOpen] = useState(false);

    // Auto-refresh poll if processing
    useEffect(() => {
        if (!isProcessing) return;
        
        const interval = setInterval(() => {
            startTransition(() => {
                router.refresh();
            });
        }, 5000); // Poll every 5 seconds

        return () => clearInterval(interval);
    }, [isProcessing, router]);

    const displayUrl = isProtected && artwork.protectedUrl ? artwork.protectedUrl : artwork.url;

    // Handlers
    const executeDelete = () => { 
        startTransition(async () => {
            const res = await deleteArtworkAction(artwork.id);
            if(res.success) toast.success("Deleted");
            else toast.error(res.error || "Failed");
        });
    };

    const handleDownload = () => { 
        if(isProtected && artwork.protectedUrl) window.open(artwork.protectedUrl, "_blank");
    };

    const handleCancel = () => { 
        startTransition(async () => {
            const res = await cancelProtectionAction(artwork.id);
            if(res.success) toast.success("Protection canceled");
            else toast.error(res.error || "Failed");
        });
    };

    const handleRetry = () => { 
        startTransition(async () => {
            const res = await retryProtectionAction(artwork.id);
            if(res.success) toast.success("Retrying protection");
            else toast.error(res.error || "Failed");
        });
    };

    const fileSize = artwork.size ? (artwork.size / 1024 / 1024).toFixed(2) + " MB" : "";

    return (
        <div className="group relative break-inside-avoid mb-4 overflow-hidden rounded-lg inline-block w-full align-top bg-gray-100/50 hover:bg-gray-100 transition-colors">
           
           {/* Image (Main Content) */}
            <div className="relative w-full">
                {displayUrl ? (
                    <img
                        src={displayUrl}
                        alt={artwork.title}
                        className={cn(
                            "w-full h-auto min-h-[12rem] object-cover transition-all duration-500 rounded-lg block",
                            isProcessing ? "blur-sm scale-105 opacity-80" : "group-hover:opacity-95"
                        )}
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full aspect-square min-h-[12rem] bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200">
                        <ImageIcon className="h-10 w-10 text-gray-300" />
                    </div>
                )}

                {/* Overlays */}
                <div className="absolute inset-0 p-3 flex flex-col justify-between pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-b from-black/40 via-transparent to-black/60">
                    
                    {/* Top Row */}
                    <div className="flex justify-between items-start">
                        {/* Top-Left: Filename */}
                        <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded text-xs text-white max-w-[65%] truncate pointer-events-auto select-none" title={artwork.title}>
                            {artwork.title}
                        </div>

                        {/* Top-Right: Actions */}
                        <div className="flex gap-1.5 pointer-events-auto">
                            {isProcessing && (
                                <Button variant="secondary" size="icon" className="h-7 w-7 bg-black/60 hover:bg-red-500/80 text-white rounded-full border-0 shadow-sm" onClick={handleCancel} disabled={isPending} title="Cancel">
                                    <XCircle className="h-4 w-4" />
                                </Button>
                            )}
                             {isProtected && (
                                <>
                                    <Button variant="secondary" size="icon" className="h-7 w-7 bg-black/60 hover:bg-indigo-500/80 text-white rounded-full border-0 shadow-sm" onClick={handleDownload} disabled={isPending} title="Download">
                                        <Download className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="secondary" size="icon" className="h-7 w-7 bg-black/60 hover:bg-red-500/80 text-white rounded-full border-0 shadow-sm" onClick={() => setDeleteOpen(true)} disabled={isPending} title="Delete">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </>
                            )}
                            {(isFailed || isCanceled) && (
                                <>
                                    <Button variant="secondary" size="icon" className="h-7 w-7 bg-black/60 hover:bg-blue-500/80 text-white rounded-full border-0 shadow-sm" onClick={handleRetry} disabled={isPending} title="Retry">
                                        <RefreshCcw className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="secondary" size="icon" className="h-7 w-7 bg-black/60 hover:bg-red-500/80 text-white rounded-full border-0 shadow-sm" onClick={() => setDeleteOpen(true)} disabled={isPending} title="Delete">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Bottom Row */}
                    <div className="flex justify-between items-end">
                        {/* Bottom-Left: File Size */}
                        <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] font-medium text-white/90 pointer-events-auto">
                            {fileSize}
                        </div>

                        {/* Bottom-Right: Status Icon (Hidden in overlay, shown persistently below) */}
                        <div className="bg-black/60 backdrop-blur-md p-1.5 rounded-full pointer-events-auto" title={artwork.protectionStatus}>
                            {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
                            {isProtected && <Shield className="h-4 w-4 text-green-400" />}
                            {isFailed && <XCircle className="h-4 w-4 text-red-500" />}
                            {isCanceled && <XCircle className="h-4 w-4 text-gray-400" />}
                        </div>
                    </div>
                </div>

                {/* Persistent Status Icon (Always visible when not hovering, bottom right) */}
                <div className="absolute bottom-3 right-3 pointer-events-none transition-opacity duration-300 group-hover:opacity-0">
                     <div className="bg-black/40 backdrop-blur-md p-1.5 rounded-full shadow-sm">
                        {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
                        {isProtected && <Shield className="h-4 w-4 text-green-400" />}
                        {isFailed && <XCircle className="h-4 w-4 text-red-500" />}
                        {isCanceled && <XCircle className="h-4 w-4 text-gray-400" />}
                     </div>
                 </div>

            </div>

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the
                            artwork and remove the data from our servers.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={executeDelete}
                            className="bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
