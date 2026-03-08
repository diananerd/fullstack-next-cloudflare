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
import { CollectionNameField } from "@/modules/artworks/components/collection-name-field";
import { updateCollectionAction } from "@/modules/artworks/actions/collection.action";

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
        if (open) {
            setName(currentName);
            setError(null);
        }
    }, [open, currentName]);

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
                    <CollectionNameField
                        id="rename-collection"
                        value={name}
                        error={error}
                        onChange={(val, err) => {
                            setName(val);
                            setError(err);
                        }}
                    />
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
