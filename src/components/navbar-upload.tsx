"use client";

import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useTransition, useState } from "react";
import { toast } from "react-hot-toast";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createArtworkAction } from "@/modules/artworks/actions/create-artwork.action";
import { ProtectArtworkDialog } from "@/modules/artworks/components/protect-artwork-dialog";

interface UploadArtworkButtonProps extends ButtonProps {
    text?: string;
    showIcon?: boolean;
    method?: string;
    iconClassName?: string;
}

export function UploadArtworkButton({
    className,
    variant = "default",
    size = "sm",
    text,
    showIcon = true,
    method,
    iconClassName,
    ...props
}: UploadArtworkButtonProps) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();
    const [createdArtworkId, setCreatedArtworkId] = useState<number | null>(null);
    const [showProtection, setShowProtection] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    const getImageDimensions = (
        file: File,
    ): Promise<{ width: number; height: number }> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () =>
                resolve({ width: img.width, height: img.height });
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    };

    const computeSHA256 = async (file: File) => {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        return hashHex;
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validation
        if (!["image/jpeg", "image/png"].includes(file.type)) {
            toast.error("Invalid file type. Only PNG and JPEG are allowed.");
            e.target.value = ""; // Reset
            return;
        }
        if (file.size > 50 * 1024 * 1024) {
            // 50MB
            toast.error("File size exceeds 50MB limit.");
            e.target.value = ""; // Reset
            return;
        }

        try {
            const { width, height } = await getImageDimensions(file);
            const minDim = 512;
            const maxDim = 8192; // 8K Safety Limit

            // 1. Min Dimension Check (for Stable Diffusion stability)
            if (width < minDim && height < minDim) {
                toast.error(
                    `Image is too small. Minimum dimension is ${minDim}px.`,
                );
                e.target.value = "";
                return;
            }

            // 2. Max Dimension Check (sanity check before server)
            if (width > maxDim || height > maxDim) {
                toast.error(
                    `Image is too large. Max dimension is ${maxDim}px.`,
                );
                e.target.value = "";
                return;
            }

            // 3. Aspect Ratio Check (Prevent extreme strips)
            const ratio = width / height;
            if (ratio < 0.2 || ratio > 5) {
                toast.error(
                    "Extreme aspect ratio detected. Please use standard image proportions.",
                );
                e.target.value = "";
                return;
            }
        } catch (e) {
            console.error("Failed to validate image dimensions", e);
            toast.error("Failed to validate image file.");
            return;
        }

        // Reset input value to allow selecting same file again if needed
        e.target.value = "";

        // Start loading toast immediately
        const toastId = toast.loading("Uploading artwork...", {
            id: "upload-toast",
        });

        try {
            const fileHash = await computeSHA256(file);
            const formData = new FormData();
            formData.append("title", file.name.split(".")[0]);
            formData.append("image", file);
            formData.append("hash", fileHash);
            if (method) {
                formData.append("method", method);
            }

            startTransition(async () => {
                try {
                    const result = await createArtworkAction(formData);
                    if (result.success) {
                        toast.success("Artwork uploaded successfully", {
                            id: toastId,
                        });
                        
                        // Automatically open protection dialog
                        if (result.artworkId) {
                            setCreatedArtworkId(result.artworkId);
                            setTimeout(() => setShowProtection(true), 300);
                        }

                        router.refresh();
                    } else {
                        // Handle server-returned errors
                        toast.error(
                            result.error || "Upload failed. Please try again.",
                            { id: toastId },
                        );
                    }
                } catch (err) {
                    // Handle network or system errors (like body size limit if not caught by client check)
                    console.error("Upload error:", err);
                    toast.error(
                        "An error occurred during upload. Please check your connection or file size.",
                        { id: toastId },
                    );
                }
            });
        } catch (error) {
            console.error("Preparation error:", error);
            toast.error("Failed to process file for upload", { id: toastId });
        }
    };

    return (
        <>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png, image/jpeg"
                className="hidden"
                disabled={isPending}
            />
            <Button
                onClick={handleClick}
                disabled={isPending}
                className={cn("gap-2 shadow-sm", className)}
                variant={variant}
                size={size}
                {...props}
            >
                {isPending ? (
                    <Loader2 className={cn("h-5 w-5 animate-spin", iconClassName)} />
                ) : (
                    showIcon && <Upload className={cn("h-5 w-5", iconClassName)} />
                )}
                {text !== undefined ? text : (
                    <>
                        <span className="hidden sm:inline">Upload Artwork</span>
                        <span className="sm:hidden">Upload</span>
                    </>
                )}
            </Button>
            
            {createdArtworkId && (
                <ProtectArtworkDialog 
                    artworkId={createdArtworkId}
                    open={showProtection}
                    onOpenChange={setShowProtection}
                />
            )}
        </>
    );
}

// Backward compatibility or for specific navbar usage, though we can just export the main one
export const NavbarUploadButton = UploadArtworkButton;
