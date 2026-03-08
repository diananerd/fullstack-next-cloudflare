import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db";
import { getSession } from "@/modules/auth/utils/auth-utils";
import {
    member,
    organization,
} from "@/modules/profiles/schemas/org-plugin.schema";
import { parseWorkspaceQuery } from "@/modules/artworks/models/workspace-item.model";
import { getPublicWorkspaceItemsAction } from "@/modules/profiles/actions/get-public-workspace-items.action";
import { WorkspaceBreadcrumb } from "@/modules/artworks/components/workspace-breadcrumb";
import { WorkspaceToolbar } from "@/modules/artworks/components/workspace-toolbar";
import { ArtworkGallerySkeleton } from "@/modules/artworks/components/artwork-gallery.skeleton";
import { PublicWorkspaceGrid } from "@/modules/artworks/components/public-workspace-grid";

export default async function PublicProfilePage(props: {
    params: Promise<{ username: string }>;
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const { username } = await props.params;
    const params = await props.searchParams;
    const slug = username.toLowerCase();
    const db = await getDb();

    // Resolve org by slug
    const [org] = await db
        .select()
        .from(organization)
        .where(eq(organization.slug, slug))
        .limit(1);

    if (!org) notFound();

    // Get the owner userId (artworks are owned by the user, not the org)
    const [ownerMember] = await db
        .select({ userId: member.userId })
        .from(member)
        .where(and(eq(member.organizationId, org.id), eq(member.role, "owner")))
        .limit(1);

    if (!ownerMember) notFound();

    const ownerUserId = ownerMember.userId;

    // Check if current visitor can see all visibility levels (admin/owner)
    const session = await getSession();
    let canSeeAll = false;
    if (session) {
        if (session.user.id === ownerUserId) {
            canSeeAll = true;
        } else {
            const [visitorMembership] = await db
                .select({ role: member.role })
                .from(member)
                .where(
                    and(
                        eq(member.organizationId, org.id),
                        eq(member.userId, session.user.id),
                    ),
                )
                .limit(1);
            canSeeAll = visitorMembership
                ? ["owner", "admin"].includes(visitorMembership.role)
                : false;
        }
    }

    const collectionId = params.collectionId;
    const query = parseWorkspaceQuery(params, collectionId);
    const basePath = `/@${slug}`;

    // Initial data fetch (server-side)
    const initialResult = await getPublicWorkspaceItemsAction(
        ownerUserId,
        query,
    );

    const displayName = org.name;
    const avatarUrl = org.logo ?? null;

    return (
        <div className="min-h-screen bg-white">
            {/* Minimal public nav */}
            <header className="px-6 md:px-10 py-4 flex justify-between items-center border-b border-gray-100 bg-white sticky top-0 z-20">
                <Link href="/" className="flex items-center gap-2">
                    {/* biome-ignore lint/performance/noImgElement: brand icon */}
                    <img src="/icon.png" alt="Drimit" className="h-6 w-6" />
                    <span className="font-semibold tracking-tight text-gray-900 text-sm">
                        Drimit
                    </span>
                </Link>
                {session ? (
                    <Link
                        href="/artworks"
                        className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                    >
                        My artworks
                    </Link>
                ) : (
                    <Link
                        href="/login"
                        className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                    >
                        Log in
                    </Link>
                )}
            </header>

            {/* Sticky breadcrumb + filters bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 md:px-6 py-2 border-b border-gray-100 bg-white sticky top-[57px] z-10">
                <WorkspaceBreadcrumb
                    collectionId={collectionId}
                    basePath={basePath}
                />
                <Suspense fallback={null}>
                    <WorkspaceToolbar
                        sort={query.sort}
                        order={query.order}
                        visibility={query.visibility}
                        insideCollection={!!collectionId}
                        hideVisibility={!canSeeAll}
                    />
                </Suspense>
            </div>

            {/* Profile header — shown at root, hidden inside collection */}
            {!collectionId && (
                <div className="px-4 md:px-6 pt-6 pb-4 flex items-center gap-3">
                    {/* Avatar */}
                    <div className="h-12 w-12 rounded-full overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-400 text-lg font-medium select-none">
                        {avatarUrl ? (
                            // biome-ignore lint/performance/noImgElement: profile avatar
                            <img
                                src={avatarUrl}
                                alt={displayName}
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            displayName.charAt(0).toUpperCase()
                        )}
                    </div>
                    {/* Name + handle */}
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                            {displayName}
                        </h1>
                        <p className="text-sm text-gray-400">@{slug}</p>
                    </div>
                </div>
            )}

            {/* Gallery */}
            <div className="px-2 pb-6">
                <Suspense fallback={<ArtworkGallerySkeleton />}>
                    {initialResult.items.length === 0 ? (
                        <p className="text-sm text-gray-400 px-4 py-8 text-center">
                            No public artworks yet.
                        </p>
                    ) : (
                        <PublicWorkspaceGrid
                            ownerUserId={ownerUserId}
                            initialItems={initialResult.items}
                            initialHasMore={initialResult.hasMore}
                            query={query}
                        />
                    )}
                </Suspense>
            </div>
        </div>
    );
}
