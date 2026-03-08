"use client";

import { Bookmark, Download, Link2 } from "lucide-react";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { ArtworkFullView } from "@/modules/artworks/components/artwork-full-view";
import { CollectionPickerDialog } from "@/modules/artworks/components/collection-picker-dialog";
import type { ArtworkWorkspaceItem } from "@/modules/artworks/models/workspace-item.model";
import type { Artwork } from "@/modules/artworks/schemas/artwork.schema";

interface PublicArtworkCardProps {
    item: ArtworkWorkspaceItem;
    isLoggedIn?: boolean;
    /** Profile base path for share URL, e.g. "/@username". */
    profilePath?: string;
}

export function PublicArtworkCard({
    item,
    isLoggedIn = false,
    profilePath,
}: PublicArtworkCardProps) {
    const [open, setOpen] = useState(false);
    const [saveOpen, setSaveOpen] = useState(false);

    const artwork: Artwork = {
        id: item.id,
        title: item.title,
        description: null,
        userId: "",
        createdBy: "",
        workspaceId: null,
        r2Key: item.r2Key,
        url: item.url,
        method: "shield",
        protectionStatus: item.protectionStatus,
        jobId: null,
        metadata: null,
        width: item.width,
        height: item.height,
        size: null,
        semanticType: "digital_art",
        visibility: item.visibility,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        kind: "artwork",
    } as Artwork;

    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!item.url) return;
        try {
            toast.loading("Downloading...", { id: "dl" });
            const res = await fetch(item.url);
            if (!res.ok) throw new Error("Failed");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${item.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success("Download started", { id: "dl" });
        } catch {
            toast.error("Download failed", { id: "dl" });
        }
    };

    const handleShare = (e: React.MouseEvent) => {
        e.stopPropagation();
        const r2KeyParts = (item.r2Key ?? "").split("/");
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
        "h-7 w-7 flex items-center justify-center rounded-full bg-black/30 text-white/80 hover:bg-black/50 transition-colors";

    const hasActions = isLoggedIn || item.allowDownload;

    return (
        <>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: card click */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: card click */}
            <div
                className="group relative overflow-hidden rounded-lg w-full bg-gray-100/50 hover:bg-gray-100 transition-colors cursor-pointer"
                onClick={() => setOpen(true)}
            >
                {/* biome-ignore lint/performance/noImgElement: artwork thumbnail */}
                <img
                    src={item.url}
                    alt={item.title}
                    className="w-full h-auto min-h-[12rem] object-cover rounded-lg block group-hover:opacity-95 transition-opacity duration-200"
                    loading="lazy"
                    decoding="async"
                    onContextMenu={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                />

                <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

                {hasActions && (
                    <div className="absolute inset-0 p-3 flex flex-col pointer-events-none">
                        {/* biome-ignore lint/a11y/noStaticElementInteractions: action container */}
                        {/* biome-ignore lint/a11y/useKeyWithClickEvents: action container */}
                        <div
                            className="flex justify-end gap-1 pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {isLoggedIn && (
                                <button
                                    type="button"
                                    title="Save to board"
                                    onClick={(e) => { e.stopPropagation(); setSaveOpen(true); }}
                                    className={btn}
                                >
                                    <Bookmark className="h-4 w-4" />
                                </button>
                            )}
                            {item.allowDownload && (
                                <button
                                    type="button"
                                    title="Download"
                                    onClick={handleDownload}
                                    className={btn}
                                >
                                    <Download className="h-4 w-4" />
                                </button>
                            )}
                            <button
                                type="button"
                                title="Share"
                                onClick={handleShare}
                                className={btn}
                            >
                                <Link2 className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <ArtworkFullView
                artwork={artwork}
                isOpen={open}
                onClose={() => setOpen(false)}
                readOnly
            />

            {isLoggedIn && (
                <CollectionPickerDialog
                    mode="save"
                    artworkId={item.id}
                    open={saveOpen}
                    onOpenChange={setSaveOpen}
                />
            )}
        </>
    );
}
