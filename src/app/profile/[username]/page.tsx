import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
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
import { EditProfileButton } from "@/modules/profiles/components/edit-profile-dialog";

export default async function PublicProfilePage(props: {
    params: Promise<{ username: string }>;
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const visitor = await requireAuth();
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

    // Get the owner userId
    const [ownerMember] = await db
        .select({ userId: member.userId })
        .from(member)
        .where(and(eq(member.organizationId, org.id), eq(member.role, "owner")))
        .limit(1);

    if (!ownerMember) notFound();

    const ownerUserId = ownerMember.userId;

    // Check if current visitor can edit (admin/owner via RBAC)
    let canEdit = false;
    if (visitor.id === ownerUserId) {
        canEdit = true;
    } else {
        const [visitorMembership] = await db
            .select({ role: member.role })
            .from(member)
            .where(
                and(
                    eq(member.organizationId, org.id),
                    eq(member.userId, visitor.id),
                ),
            )
            .limit(1);
        canEdit = visitorMembership
            ? ["owner", "admin"].includes(visitorMembership.role)
            : false;
    }

    const collectionId = params.collectionId;
    const query = parseWorkspaceQuery(params, collectionId);
    const basePath = `/@${slug}`;

    const initialResult = await getPublicWorkspaceItemsAction(
        ownerUserId,
        query,
    );

    const displayName = org.name;
    const avatarUrl = org.logo ?? null;

    return (
        <div className="w-full">
            {/* Breadcrumb + Filters bar — sticky below Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 md:px-6 py-2 border-b border-gray-100 bg-white sticky top-[57px] z-10">
                <WorkspaceBreadcrumb
                    collectionId={collectionId}
                    basePath={basePath}
                    rootIcon="user"
                />
                <Suspense fallback={null}>
                    <WorkspaceToolbar
                        sort={query.sort}
                        order={query.order}
                        visibility={query.visibility}
                        insideCollection={!!collectionId}
                        hideVisibility={true}
                    />
                </Suspense>
            </div>

            {/* Profile header */}
            <div className="px-4 md:px-6 pt-6 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
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

                {canEdit && (
                    <EditProfileButton
                        orgId={org.id}
                        currentName={org.name}
                        currentSlug={org.slug ?? slug}
                        currentAvatarUrl={avatarUrl}
                    />
                )}
            </div>

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
                            basePath={basePath}
                            isLoggedIn={true}
                        />
                    )}
                </Suspense>
            </div>
        </div>
    );
}
