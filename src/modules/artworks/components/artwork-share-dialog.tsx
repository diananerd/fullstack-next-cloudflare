"use client";

import {
    Check,
    ChevronDown,
    Globe,
    Link2,
    Lock,
    Loader2,
    UserPlus,
    X,
    EyeOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { Artwork } from "../schemas/artwork.schema";
import {
    addArtworkAccessAction,
    getArtworkShareDataAction,
    removeArtworkAccessAction,
    searchUsersForShareAction,
    updateArtworkDetailsAction,
    updateArtworkVisibilityAction,
} from "../actions/artwork-share.action";

// ─── Types ────────────────────────────────────────────────────────────────────

type Visibility = "private" | "public" | "unlisted";

type AccessRole = "viewer" | "contributor" | "coauthor" | "client";

interface AccessEntry {
    id: number;
    userId: string | null;
    role: string;
    grantedAt: string | null;
    userName: string | null;
    userEmail: string | null;
    userImage: string | null;
}

interface SearchUser {
    id: string;
    name: string;
    email: string;
    image: string | null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ROLE_LABELS: Record<AccessRole, string> = {
    viewer: "Viewer",
    contributor: "Contributor",
    coauthor: "Co-author",
    client: "Client",
};

const ROLE_DESCRIPTIONS: Record<AccessRole, string> = {
    viewer: "Can view",
    contributor: "Can view & download original",
    coauthor: "Can view, download & edit",
    client: "Can view & download protected",
};

const VISIBILITY_OPTIONS: {
    value: Visibility;
    label: string;
    description: string;
    icon: React.ReactNode;
}[] = [
    {
        value: "private",
        label: "Private",
        description: "Only people with access",
        icon: <Lock className="h-4 w-4" />,
    },
    {
        value: "unlisted",
        label: "Unlisted",
        description: "Anyone with the link",
        icon: <EyeOff className="h-4 w-4" />,
    },
    {
        value: "public",
        label: "Public",
        description: "Visible in your profile",
        icon: <Globe className="h-4 w-4" />,
    },
];

function UserAvatar({
    name,
    image,
    size = "sm",
}: {
    name: string | null;
    image: string | null;
    size?: "sm" | "md";
}) {
    const initials = (name ?? "?")
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    const dim = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
    if (image) {
        return (
            <img
                src={image}
                alt={name ?? ""}
                className={`${dim} rounded-full object-cover flex-shrink-0`}
            />
        );
    }
    return (
        <div
            className={`${dim} rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center flex-shrink-0`}
        >
            {initials}
        </div>
    );
}

function RoleSelect({
    value,
    onChange,
    disabled,
}: {
    value: string;
    onChange: (v: AccessRole) => void;
    disabled?: boolean;
}) {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value as AccessRole)}
                disabled={disabled}
                className="appearance-none bg-transparent text-xs text-muted-foreground pr-5 cursor-pointer hover:text-foreground transition-colors focus:outline-none disabled:opacity-50"
            >
                {(Object.keys(ROLE_LABELS) as AccessRole[]).map((r) => (
                    <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                    </option>
                ))}
            </select>
            <ChevronDown className="absolute right-0 top-0.5 h-3 w-3 text-muted-foreground pointer-events-none" />
        </div>
    );
}

// ─── Main Dialog ─────────────────────────────────────────────────────────────

interface ArtworkShareDialogProps {
    artwork: Artwork;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ArtworkShareDialog({
    artwork,
    open,
    onOpenChange,
}: ArtworkShareDialogProps) {
    // ── State ────────────────────────────────────────────────────────────────
    const [title, setTitle] = useState(artwork.title);
    const [titleDirty, setTitleDirty] = useState(false);
    const [visibility, setVisibility] = useState<Visibility>("private");
    const [accessList, setAccessList] = useState<AccessEntry[]>([]);
    const [ownerId, setOwnerId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    // Search
    const [query, setQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
    const [selectedRole, setSelectedRole] = useState<AccessRole>("viewer");
    const [adding, setAdding] = useState(false);

    const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
    const searchRef = useRef<HTMLDivElement>(null);

    // ── Derived ──────────────────────────────────────────────────────────────
    const r2KeyParts = artwork.r2Key.split("/");
    const artworkHash =
        r2KeyParts.length >= 2
            ? r2KeyParts[r2KeyParts.length - 2]
            : r2KeyParts[0];
    const shareUrl =
        typeof window !== "undefined"
            ? `${window.location.origin}/artworks?artwork=${artworkHash}`
            : "";

    // ── Load data on open ────────────────────────────────────────────────────
    useEffect(() => {
        if (!open) return;
        setTitle(artwork.title);
        setTitleDirty(false);
        setQuery("");
        setSearchResults([]);
        setSelectedUser(null);
        setLoading(true);
        getArtworkShareDataAction(artwork.id).then((res) => {
            setLoading(false);
            if (res.success) {
                setVisibility((res.visibility ?? "private") as Visibility);
                setOwnerId(res.ownerId);
                setAccessList(res.accessList as AccessEntry[]);
            }
        });
    }, [open, artwork.id, artwork.title]);

    // ── Search ───────────────────────────────────────────────────────────────
    const runSearch = useCallback(
        (q: string) => {
            clearTimeout(searchTimeout.current);
            if (q.length < 2) {
                setSearchResults([]);
                setSearching(false);
                return;
            }
            setSearching(true);
            searchTimeout.current = setTimeout(async () => {
                const res = await searchUsersForShareAction(artwork.id, q);
                setSearching(false);
                if (res.success) setSearchResults(res.users as SearchUser[]);
            }, 280);
        },
        [artwork.id],
    );

    const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setQuery(v);
        setSelectedUser(null);
        runSearch(v);
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (
                searchRef.current &&
                !searchRef.current.contains(e.target as Node)
            ) {
                setSearchResults([]);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // ── Add access ───────────────────────────────────────────────────────────
    const handleAdd = async () => {
        if (!selectedUser) return;
        setAdding(true);
        const res = await addArtworkAccessAction(
            artwork.id,
            selectedUser.id,
            selectedRole,
        );
        setAdding(false);
        if (res.success) {
            toast.success(`Access granted to ${selectedUser.name}`);
            setQuery("");
            setSelectedUser(null);
            setSearchResults([]);
            // Refresh list
            const fresh = await getArtworkShareDataAction(artwork.id);
            if (fresh.success) setAccessList(fresh.accessList as AccessEntry[]);
        } else {
            toast.error(res.error ?? "Failed");
        }
    };

    // ── Remove access ─────────────────────────────────────────────────────────
    const handleRemove = async (userId: string, name: string | null) => {
        const res = await removeArtworkAccessAction(artwork.id, userId);
        if (res.success) {
            setAccessList((prev) => prev.filter((a) => a.userId !== userId));
            toast.success(`Removed ${name ?? "user"}`);
        } else {
            toast.error(res.error ?? "Failed");
        }
    };

    // ── Role change ───────────────────────────────────────────────────────────
    const handleRoleChange = async (userId: string, role: AccessRole) => {
        const res = await addArtworkAccessAction(artwork.id, userId, role);
        if (res.success) {
            setAccessList((prev) =>
                prev.map((a) => (a.userId === userId ? { ...a, role } : a)),
            );
        } else {
            toast.error(res.error ?? "Failed");
        }
    };

    // ── Visibility ────────────────────────────────────────────────────────────
    const handleVisibilityChange = async (v: Visibility) => {
        setVisibility(v);
        const res = await updateArtworkVisibilityAction(artwork.id, v);
        if (!res.success) {
            toast.error(res.error ?? "Failed");
        }
    };

    // ── Title save ────────────────────────────────────────────────────────────
    const handleTitleBlur = async () => {
        if (!titleDirty || !title.trim()) return;
        setSaving(true);
        const res = await updateArtworkDetailsAction(artwork.id, {
            title: title.trim(),
        });
        setSaving(false);
        if (res.success) {
            setTitleDirty(false);
            toast.success("Title updated");
        } else {
            toast.error(res.error ?? "Failed");
        }
    };

    // ── Copy link ─────────────────────────────────────────────────────────────
    const handleCopyLink = () => {
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
                <DialogHeader className="px-5 pt-5 pb-4">
                    <DialogTitle className="text-base">Share</DialogTitle>
                </DialogHeader>

                <div className="px-5 pb-5 space-y-5">
                    {/* Title edit */}
                    <div className="relative">
                        <Input
                            value={title}
                            onChange={(e) => {
                                setTitle(e.target.value);
                                setTitleDirty(true);
                            }}
                            onBlur={handleTitleBlur}
                            onKeyDown={(e) => {
                                if (e.key === "Enter")
                                    (e.target as HTMLInputElement).blur();
                            }}
                            className="pr-8 font-medium"
                            placeholder="Artwork title"
                        />
                        {saving && (
                            <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                    </div>

                    <Separator />

                    {/* Add people */}
                    <div ref={searchRef} className="relative space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Add people
                        </p>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Input
                                    value={query}
                                    onChange={handleQueryChange}
                                    placeholder="Search by name or email…"
                                    className="pr-8 text-sm"
                                />
                                {searching && (
                                    <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                                )}
                                {/* Dropdown */}
                                {(searchResults.length > 0 ||
                                    (query.length >= 2 && !searching)) && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md z-50 overflow-hidden">
                                        {searchResults.length === 0 ? (
                                            <p className="px-3 py-2.5 text-sm text-muted-foreground">
                                                No users found
                                            </p>
                                        ) : (
                                            searchResults.map((u) => (
                                                <button
                                                    key={u.id}
                                                    type="button"
                                                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent text-left transition-colors"
                                                    onClick={() => {
                                                        setSelectedUser(u);
                                                        setQuery(
                                                            u.name || u.email,
                                                        );
                                                        setSearchResults([]);
                                                    }}
                                                >
                                                    <UserAvatar
                                                        name={u.name}
                                                        image={u.image}
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium truncate">
                                                            {u.name}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            {u.email}
                                                        </p>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                            {selectedUser && (
                                <RoleSelect
                                    value={selectedRole}
                                    onChange={setSelectedRole}
                                />
                            )}
                            <Button
                                size="sm"
                                onClick={handleAdd}
                                disabled={!selectedUser || adding}
                                className="flex-shrink-0"
                            >
                                {adding ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <UserPlus className="h-3.5 w-3.5" />
                                )}
                                <span className="ml-1.5">Invite</span>
                            </Button>
                        </div>
                    </div>

                    {/* People with access */}
                    {(loading || accessList.length > 0 || ownerId) && (
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                People with access
                            </p>
                            <div className="space-y-1">
                                {loading ? (
                                    <div className="flex items-center gap-2 py-1 text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span className="text-sm">
                                            Loading…
                                        </span>
                                    </div>
                                ) : (
                                    <>
                                        {/* Owner row */}
                                        {ownerId && (
                                            <div className="flex items-center gap-2.5 py-1">
                                                <UserAvatar
                                                    name="You"
                                                    image={null}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium">
                                                        You
                                                    </p>
                                                </div>
                                                <Badge
                                                    variant="secondary"
                                                    className="text-xs"
                                                >
                                                    Owner
                                                </Badge>
                                            </div>
                                        )}
                                        {/* Access rows */}
                                        {accessList.map((entry) => (
                                            <div
                                                key={entry.id}
                                                className="flex items-center gap-2.5 py-1 group"
                                            >
                                                <UserAvatar
                                                    name={entry.userName}
                                                    image={entry.userImage}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">
                                                        {entry.userName ??
                                                            "Unknown"}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {entry.userEmail}
                                                    </p>
                                                </div>
                                                <RoleSelect
                                                    value={entry.role}
                                                    onChange={(r) =>
                                                        entry.userId &&
                                                        handleRoleChange(
                                                            entry.userId,
                                                            r,
                                                        )
                                                    }
                                                />
                                                <button
                                                    type="button"
                                                    title="Remove access"
                                                    className="h-5 w-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                                                    onClick={() =>
                                                        entry.userId &&
                                                        handleRemove(
                                                            entry.userId,
                                                            entry.userName,
                                                        )
                                                    }
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    <Separator />

                    {/* General access / visibility */}
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            General access
                        </p>
                        <div className="flex gap-1.5">
                            {VISIBILITY_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() =>
                                        handleVisibilityChange(opt.value)
                                    }
                                    className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-center transition-all text-xs ${
                                        visibility === opt.value
                                            ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                                            : "border-border text-muted-foreground hover:border-muted-foreground/50"
                                    }`}
                                >
                                    {opt.icon}
                                    <span className="font-medium">
                                        {opt.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {
                                VISIBILITY_OPTIONS.find(
                                    (o) => o.value === visibility,
                                )?.description
                            }
                        </p>
                    </div>

                    {/* Copy link */}
                    <div className="flex items-center gap-2 pt-1">
                        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-sm text-muted-foreground overflow-hidden">
                            <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate text-xs">{shareUrl}</span>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopyLink}
                            className="flex-shrink-0 gap-1.5"
                        >
                            {copied ? (
                                <Check className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                                <Link2 className="h-3.5 w-3.5" />
                            )}
                            {copied ? "Copied!" : "Copy link"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
