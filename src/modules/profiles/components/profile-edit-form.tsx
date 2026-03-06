"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Organization } from "@/modules/profiles/schemas/org-plugin.schema";
import { createProfileAction, updateProfileAction } from "@/modules/profiles/actions/profile.action";

// ── Create form (no org yet) ──────────────────────────────────────────────────

const SLUG_PATTERN = /^[a-z0-9][a-z0-9\-]{0,48}[a-z0-9]$|^[a-z0-9]{1,2}$/;

export function CreateProfileForm() {
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [slugError, setSlugError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const handleSlugChange = (val: string) => {
        const s = val.toLowerCase().replace(/[^a-z0-9\-]/g, "");
        setSlug(s);
        if (s.length > 0 && !SLUG_PATTERN.test(s))
            setSlugError("Letters, numbers, hyphens only. No leading/trailing hyphens.");
        else setSlugError(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !slug.trim() || slugError) return;

        startTransition(async () => {
            const result = await createProfileAction(name, slug);
            if (result.success) {
                toast.success("Profile created.");
                router.refresh();
            } else {
                toast.error(result.error ?? "Something went wrong.");
            }
        });
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-md">
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-name">Display name</Label>
                <Input
                    id="profile-name"
                    placeholder="Diana Martínez"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    autoFocus
                />
            </div>

            <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-slug">
                    Handle <span className="text-muted-foreground font-normal">(@username)</span>
                </Label>
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">drimit.io/@</span>
                    <Input
                        id="profile-slug"
                        placeholder="diananerd"
                        value={slug}
                        onChange={(e) => handleSlugChange(e.target.value)}
                        maxLength={50}
                        className="flex-1"
                    />
                </div>
                {slugError && <p className="text-xs text-red-500">{slugError}</p>}
            </div>

            <Button
                type="submit"
                disabled={isPending || !name.trim() || !slug.trim() || !!slugError}
            >
                {isPending ? "Creating…" : "Create profile"}
            </Button>
        </form>
    );
}

// ── Edit form (org exists, owner/admin) ───────────────────────────────────────

interface ProfileEditFormProps {
    org: Organization;
}

export function ProfileEditForm({ org }: ProfileEditFormProps) {
    const [name, setName] = useState(org.name);
    const [bio, setBio] = useState(org.bio ?? "");
    const [websiteUrl, setWebsiteUrl] = useState(org.websiteUrl ?? "");
    const [visibility, setVisibility] = useState(org.visibility ?? "public");
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const isDirty =
        name !== org.name ||
        bio !== (org.bio ?? "") ||
        websiteUrl !== (org.websiteUrl ?? "") ||
        visibility !== (org.visibility ?? "public");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        startTransition(async () => {
            const result = await updateProfileAction(org.id, { name, bio, websiteUrl, visibility });
            if (result.success) {
                toast.success("Profile saved.");
                router.refresh();
            } else {
                toast.error(result.error ?? "Something went wrong.");
            }
        });
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-md">
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-name">Display name</Label>
                <Input
                    id="edit-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                />
            </div>

            <div className="flex flex-col gap-1.5">
                <Label>Handle</Label>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>drimit.io/@{org.slug}</span>
                    <span className="text-xs">(contact support to change)</span>
                </div>
            </div>

            <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-bio">Bio</Label>
                <Textarea
                    id="edit-bio"
                    placeholder="A short description about you or your work."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={300}
                    rows={3}
                />
                <p className="text-xs text-muted-foreground">{bio.length}/300</p>
            </div>

            <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-website">Website</Label>
                <Input
                    id="edit-website"
                    type="url"
                    placeholder="https://yoursite.com"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                />
            </div>

            <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-visibility">Visibility</Label>
                <select
                    id="edit-visibility"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private</option>
                </select>
            </div>

            <div className="flex justify-end">
                <Button type="submit" disabled={isPending || !isDirty || !name.trim()}>
                    {isPending ? "Saving…" : "Save changes"}
                </Button>
            </div>
        </form>
    );
}
