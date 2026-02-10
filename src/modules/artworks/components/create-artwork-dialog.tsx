"use client";

import { Loader2, Plus, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createArtworkAction } from "../actions/create-artwork.action";
import { ProtectArtworkDialog } from "./protect-artwork-dialog";

export function CreateArtworkDialog() {
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [createdArtworkId, setCreatedArtworkId] = useState<number | null>(null);
    const [showProtection, setShowProtection] = useState(false);
    const router = useRouter();

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const file = formData.get("image") as File;

        // Client-side validation
        if (file) {
            if (!["image/jpeg", "image/png"].includes(file.type)) {
                toast.error(
                    "Invalid file type. Only PNG and JPEG are allowed.",
                );
                return;
            }
            if (file.size > 10 * 1024 * 1024) {
                // 10MB
                toast.error("File size exceeds 10MB limit.");
                return;
            }
        }

        startTransition(async () => {
            const res = await createArtworkAction(formData);
            if (res.success) {
                toast.success("Artwork uploaded successfully");
                setOpen(false);
                if (res.artworkId) {
                    setCreatedArtworkId(res.artworkId);
                    // Add a small delay to ensure the first dialog closes smoothly
                    setTimeout(() => setShowProtection(true), 300);
                }
                router.refresh();
            } else {
                toast.error(res.error || "Failed to upload artwork");
            }
        });
    };

    return (
        <>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button className="gap-2 shadow-sm">
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">Upload Artwork</span>
                        <span className="sm:hidden">Add</span>
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Upload Artwork</DialogTitle>
                        <DialogDescription>
                            Upload an image to protect it with Drimit.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                        <div className="grid w-full max-w-sm items-center gap-1.5">
                            <Label htmlFor="image">Image</Label>
                            <div className="flex items-center justify-center w-full">
                                <label
                                    htmlFor="image"
                                    className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-bray-800 dark:bg-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-600"
                                >
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        <Upload className="w-8 h-8 mb-4 text-gray-500 dark:text-gray-400" />
                                        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                                            <span className="font-semibold">
                                                Click to upload
                                            </span>
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            PNG or JPG (Max 10MB)
                                        </p>
                                    </div>
                                    <Input
                                        id="image"
                                        name="image"
                                        type="file"
                                        accept="image/png, image/jpeg"
                                        className="hidden"
                                        required
                                    />
                                </label>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={isPending}>
                                {isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {isPending ? "Uploading..." : "Upload & Protect"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

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
