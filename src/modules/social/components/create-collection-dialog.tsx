"use client";

import { FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { CollectionNameField } from "@/modules/artworks/components/collection-name-field";
import { createCollectionAction } from "@/modules/artworks/actions/collection.action";

interface CreateCollectionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    collectionId?: string;
}

export function CreateCollectionDialog({
    open,
    onOpenChange,
    collectionId,
}: CreateCollectionDialogProps) {
    const [title, setTitle] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const handleOpenChange = (val: boolean) => {
        if (!val) {
            setTitle("");
            setError(null);
        }
        onOpenChange(val);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) {
            setError("Name is required.");
            return;
        }
        if (error) return;

        startTransition(async () => {
            const result = await createCollectionAction(title, collectionId);
            if (result.success) {
                toast.success("Collection created.");
                setTitle("");
                setError(null);
                onOpenChange(false);
                router.refresh();
            } else {
                setError(result.error ?? "Something went wrong.");
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>New collection</DialogTitle>
                </DialogHeader>
                <form
                    onSubmit={handleSubmit}
                    className="mt-2 flex flex-col gap-4"
                >
                    <CollectionNameField
                        id="collection-name"
                        value={title}
                        error={error}
                        onChange={(val, err) => {
                            setTitle(val);
                            setError(err);
                        }}
                        placeholder="e.g. Character sketches"
                        hint="Private by default"
                    />
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenChange(false)}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={
                                isPending ||
                                title.trim().length === 0 ||
                                !!error
                            }
                        >
                            {isPending ? "Creating…" : "Create"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// FAB trigger — self-contained button + dialog
export function CreateCollectionFab({
    collectionId,
}: {
    collectionId?: string;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex items-center justify-center w-11 h-11 rounded-full bg-white border border-gray-200 shadow-lg text-gray-700 hover:bg-gray-50 hover:scale-105 transition-all z-50"
                aria-label="New collection"
            >
                <FolderPlus className="h-5 w-5" />
            </button>
            <CreateCollectionDialog
                open={open}
                onOpenChange={setOpen}
                collectionId={collectionId}
            />
        </>
    );
}
