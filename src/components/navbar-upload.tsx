"use client";

import { Upload, Loader2, UploadCloud } from "lucide-react";
import { useState, useTransition, useRef } from "react";
import { Button, ButtonProps } from "@/components/ui/button";
import { createArtworkAction } from "@/modules/artworks/actions/create-artwork.action";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

interface UploadArtworkButtonProps extends ButtonProps {
    text?: string;
    showIcon?: boolean;
}

export function UploadArtworkButton({
    className,
    variant = "default",
    size = "sm",
    text,
    showIcon = true,
    ...props
}: UploadArtworkButtonProps) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleClick = () => {
        fileInputRef.current?.click();
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

            startTransition(async () => {
                try {
                    const result = await createArtworkAction(formData);
                    if (result.success) {
                        toast.success("Artwork uploaded successfully", {
                            id: toastId,
                        });
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
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    showIcon && <UploadCloud className="h-4 w-4" />
                )}
                {text || (
                    <>
                        <span className="hidden sm:inline">Upload Artwork</span>
                        <span className="sm:hidden">Upload</span>
                    </>
                )}
            </Button>
        </>
    );
}

// Backward compatibility or for specific navbar usage, though we can just export the main one
export const NavbarUploadButton = UploadArtworkButton;
