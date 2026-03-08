"use client";

import { Pencil } from "lucide-react";
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
import { AvatarCropUpload } from "@/modules/profiles/components/avatar-crop-upload";
import { updateProfileAction } from "@/modules/profiles/actions/profile.action";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9\-]{0,48}[a-z0-9]$|^[a-z0-9]{1,2}$/;

interface EditProfileDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orgId: string;
    currentName: string;
    currentSlug: string;
    currentAvatarUrl: string | null;
}

export function EditProfileDialog({
    open,
    onOpenChange,
    orgId,
    currentName,
    currentSlug,
    currentAvatarUrl,
}: EditProfileDialogProps) {
    const [name, setName] = useState(currentName);
    const [slug, setSlug] = useState(currentSlug);
    const [slugError, setSlugError] = useState<string | null>(null);
    const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    useEffect(() => {
        if (open) {
            setName(currentName);
            setSlug(currentSlug);
            setSlugError(null);
            setAvatarUrl(currentAvatarUrl);
        }
    }, [open, currentName, currentSlug, currentAvatarUrl]);

    const handleSlugChange = (val: string) => {
        const s = val.toLowerCase().replace(/[^a-z0-9\-]/g, "");
        setSlug(s);
        if (s.length > 0 && !SLUG_PATTERN.test(s)) {
            setSlugError(
                "Letters, numbers, hyphens only. No leading/trailing hyphens.",
            );
        } else {
            setSlugError(null);
        }
    };

    const isDirty =
        name.trim() !== currentName ||
        slug !== currentSlug ||
        avatarUrl !== currentAvatarUrl;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName || slugError) return;

        startTransition(async () => {
            const result = await updateProfileAction(orgId, {
                name: trimmedName,
                slug: slug !== currentSlug ? slug : undefined,
            });
            if (result.success) {
                toast.success("Profile updated.");
                onOpenChange(false);
                if (slug !== currentSlug) {
                    router.push(`/@${slug}`);
                } else {
                    router.refresh();
                }
            } else {
                toast.error(result.error ?? "Something went wrong.");
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Edit profile</DialogTitle>
                </DialogHeader>
                <form
                    onSubmit={handleSubmit}
                    className="mt-2 flex flex-col gap-4"
                >
                    <AvatarCropUpload
                        orgId={orgId}
                        currentAvatarUrl={avatarUrl}
                        displayName={name || currentName}
                        onSuccess={(url) => setAvatarUrl(url)}
                    />

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="edit-profile-name">Display name</Label>
                        <Input
                            id="edit-profile-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={80}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="edit-profile-slug">Username</Label>
                        <div className="flex items-center gap-1">
                            <span className="text-sm text-muted-foreground">
                                @
                            </span>
                            <Input
                                id="edit-profile-slug"
                                value={slug}
                                onChange={(e) =>
                                    handleSlugChange(e.target.value)
                                }
                                maxLength={50}
                                className="flex-1"
                            />
                        </div>
                        {slugError && (
                            <p className="text-xs text-red-500">{slugError}</p>
                        )}
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
                                isPending ||
                                !name.trim() ||
                                !!slugError ||
                                !isDirty
                            }
                        >
                            {isPending ? "Saving…" : "Save"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function EditProfileButton({
    orgId,
    currentName,
    currentSlug,
    currentAvatarUrl,
}: {
    orgId: string;
    currentName: string;
    currentSlug: string;
    currentAvatarUrl: string | null;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
            >
                <Pencil className="h-4 w-4 mr-1.5" />
                Edit profile
            </Button>
            <EditProfileDialog
                open={open}
                onOpenChange={setOpen}
                orgId={orgId}
                currentName={currentName}
                currentSlug={currentSlug}
                currentAvatarUrl={currentAvatarUrl}
            />
        </>
    );
}
