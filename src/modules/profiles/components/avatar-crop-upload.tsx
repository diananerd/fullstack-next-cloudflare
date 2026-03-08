"use client";

import { useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateAvatarAction } from "@/modules/profiles/actions/update-avatar.action";

const CROP_SIZE = 240;

interface AvatarCropUploadProps {
    orgId: string;
    currentAvatarUrl?: string | null;
    displayName: string;
    onSuccess: (url: string) => void;
}

export function AvatarCropUpload({
    orgId,
    currentAvatarUrl,
    displayName,
    onSuccess,
}: AvatarCropUploadProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [isPending, setIsPending] = useState(false);
    const dragStart = useRef<{
        px: number;
        py: number;
        ox: number;
        oy: number;
    } | null>(null);
    const fileRef = useRef<File | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        fileRef.current = f;
        setImageUrl(URL.createObjectURL(f));
    };

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        setNaturalSize({ w, h });
        // Cover: image fills the circle at initial scale
        const initScale = Math.max(CROP_SIZE / w, CROP_SIZE / h) * 1.05;
        setScale(initScale);
        setOffset({ x: 0, y: 0 });
    };

    const handleCancel = () => {
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        setImageUrl(null);
        fileRef.current = null;
        if (inputRef.current) inputRef.current.value = "";
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragStart.current = {
            px: e.clientX,
            py: e.clientY,
            ox: offset.x,
            oy: offset.y,
        };
        setIsDragging(true);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragStart.current) return;
        setOffset({
            x: dragStart.current.ox + (e.clientX - dragStart.current.px),
            y: dragStart.current.oy + (e.clientY - dragStart.current.py),
        });
    };

    const handlePointerUp = () => {
        dragStart.current = null;
        setIsDragging(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        setScale((s) => Math.max(0.3, Math.min(5, s * (1 - e.deltaY * 0.001))));
    };

    const handleSave = async () => {
        if (!fileRef.current || !imageUrl || !naturalSize.w) return;
        setIsPending(true);
        try {
            const img = new Image();
            img.src = imageUrl;
            await new Promise<void>((res) => {
                img.onload = () => res();
            });

            const canvas = document.createElement("canvas");
            canvas.width = CROP_SIZE;
            canvas.height = CROP_SIZE;
            const ctx = canvas.getContext("2d")!;

            // Circular clip
            ctx.beginPath();
            ctx.arc(
                CROP_SIZE / 2,
                CROP_SIZE / 2,
                CROP_SIZE / 2,
                0,
                Math.PI * 2,
            );
            ctx.clip();

            const imgW = naturalSize.w * scale;
            const imgH = naturalSize.h * scale;
            const imgX = CROP_SIZE / 2 - imgW / 2 + offset.x;
            const imgY = CROP_SIZE / 2 - imgH / 2 + offset.y;
            ctx.drawImage(img, imgX, imgY, imgW, imgH);

            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(
                    (b) =>
                        b
                            ? resolve(b)
                            : reject(new Error("Canvas toBlob failed")),
                    "image/jpeg",
                    0.92,
                );
            });

            const croppedFile = new File([blob], "avatar.jpg", {
                type: "image/jpeg",
            });
            const formData = new FormData();
            formData.append("avatar", croppedFile);

            const result = await updateAvatarAction(orgId, formData);
            if (result.success && result.url) {
                onSuccess(result.url);
                handleCancel();
                toast.success("Photo updated.");
            } else {
                toast.error(result.error ?? "Upload failed.");
            }
        } catch {
            toast.error("Something went wrong.");
        } finally {
            setIsPending(false);
        }
    };

    const imgW = naturalSize.w * scale;
    const imgH = naturalSize.h * scale;
    const imgX = CROP_SIZE / 2 - imgW / 2 + offset.x;
    const imgY = CROP_SIZE / 2 - imgH / 2 + offset.y;

    return (
        <>
            {/* Avatar display + upload trigger */}
            <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-500 text-xl font-medium select-none">
                    {currentAvatarUrl ? (
                        // biome-ignore lint/performance/noImgElement: avatar preview
                        <img
                            src={currentAvatarUrl}
                            alt={displayName}
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        displayName.charAt(0).toUpperCase()
                    )}
                </div>
                {/* biome-ignore lint/a11y/noLabelWithoutControl: hidden input */}
                <label className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">
                    Change photo
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={handleFileChange}
                    />
                </label>
            </div>

            {/* Crop modal */}
            {imageUrl && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-xs flex flex-col gap-4 p-5">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-900">
                                Crop photo
                            </span>
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Circular crop area */}
                        {/* biome-ignore lint/a11y/noStaticElementInteractions: crop drag area */}
                        {/* biome-ignore lint/a11y/useKeyWithClickEvents: crop drag area */}
                        <div
                            className="mx-auto relative select-none overflow-hidden rounded-full ring-2 ring-gray-200 bg-gray-900"
                            style={{
                                width: CROP_SIZE,
                                height: CROP_SIZE,
                                cursor: isDragging ? "grabbing" : "grab",
                                touchAction: "none",
                            }}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                            onWheel={handleWheel}
                        >
                            {/* biome-ignore lint/performance/noImgElement: crop preview */}
                            <img
                                src={imageUrl}
                                alt="crop preview"
                                onLoad={handleImageLoad}
                                draggable={false}
                                style={{
                                    position: "absolute",
                                    width: imgW,
                                    height: imgH,
                                    left: imgX,
                                    top: imgY,
                                    userSelect: "none",
                                    pointerEvents: "none",
                                }}
                            />
                        </div>

                        {/* Zoom */}
                        <div className="flex items-center gap-2 px-1">
                            <span className="text-xs text-gray-400 w-3 text-center">
                                −
                            </span>
                            <input
                                type="range"
                                min={30}
                                max={500}
                                step={5}
                                value={Math.round(scale * 100)}
                                onChange={(e) =>
                                    setScale(Number(e.target.value) / 100)
                                }
                                className="flex-1"
                            />
                            <span className="text-xs text-gray-400 w-3 text-center">
                                +
                            </span>
                        </div>
                        <p className="text-xs text-gray-400 text-center -mt-2">
                            Drag and scroll to adjust
                        </p>

                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleCancel}
                                disabled={isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleSave}
                                disabled={isPending || !naturalSize.w}
                            >
                                {isPending ? "Uploading…" : "Save photo"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
