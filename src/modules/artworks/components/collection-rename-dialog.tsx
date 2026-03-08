"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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
import { updateCollectionAction } from "@/modules/artworks/actions/collection.action";

const TITLE_PATTERN = /^[\p{L}\p{N}\s'\-\.,]*$/u;

interface CollectionRenameDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    collectionId: string;
    currentName: string;
}

export function CollectionRenameDialog({
    open,
    onOpenChange,
    collectionId,
    currentName,
}: CollectionRenameDialogProps) {
    const [name, setName] = useState(currentName);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    useEffect(() => {
        if (open) setName(currentName);
    }, [open, currentName]);

    const validate = (value: string): string | null => {
        const trimmed = value.trim();
        if (trimmed.length === 0) return null;
        if (trimmed.length > 50) return "50 characters max.";
        if (!TITLE_PATTERN.test(value))
            return "Only letters, numbers, spaces, and ' - . , are allowed.";
        return null;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setName(val);
        setError(validate(val));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) {
            setError("Name is required.");
            return;
        }
        if (error) return;
        if (trimmed === currentName) {
            onOpenChange(false);
            return;
        }

        startTransition(async () => {
            const result = await updateCollectionAction(collectionId, {
                name: trimmed,
            });
            if (result.success) {
                toast.success("Collection renamed.");
                onOpenChange(false);
                router.refresh();
            } else {
                setError(result.error ?? "Something went wrong.");
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Rename collection</DialogTitle>
                </DialogHeader>
                <form
                    onSubmit={handleSubmit}
                    className="mt-2 flex flex-col gap-4"
                >
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="rename-collection">Name</Label>
                        <Input
                            id="rename-collection"
                            value={name}
                            onChange={handleChange}
                            maxLength={51}
                            autoFocus
                            autoComplete="off"
                        />
                        {error && (
                            <p className="text-xs text-red-500">{error}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            {name.trim().length}/50
                        </p>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={
                                isPending || name.trim().length === 0 || !!error
                            }
                        >
                            {isPending ? "Saving…" : "Rename"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
