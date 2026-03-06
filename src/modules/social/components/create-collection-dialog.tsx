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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCollectionAction } from "@/modules/social/actions/create-collection.action";

const TITLE_PATTERN = /^[\p{L}\p{N}\s'\-\.,]*$/u;

interface CreateCollectionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CreateCollectionDialog({
    open,
    onOpenChange,
}: CreateCollectionDialogProps) {
    const [title, setTitle] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const validate = (value: string): string | null => {
        const trimmed = value.trim();
        if (trimmed.length === 0) return null; // no error while empty
        if (trimmed.length > 50) return "50 characters max.";
        if (!TITLE_PATTERN.test(value))
            return "Only letters, numbers, spaces, and ' - . , are allowed.";
        return null;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setTitle(val);
        setError(validate(val));
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
            const result = await createCollectionAction(title);
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

    const handleOpenChange = (val: boolean) => {
        if (!val) {
            setTitle("");
            setError(null);
        }
        onOpenChange(val);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>New collection</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="collection-name">Name</Label>
                        <Input
                            id="collection-name"
                            placeholder="e.g. Character sketches"
                            value={title}
                            onChange={handleChange}
                            maxLength={51}
                            autoFocus
                            autoComplete="off"
                        />
                        {error && (
                            <p className="text-xs text-red-500">{error}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            {title.trim().length}/50 · Private by default
                        </p>
                    </div>
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
export function CreateCollectionFab() {
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
            <CreateCollectionDialog open={open} onOpenChange={setOpen} />
        </>
    );
}
