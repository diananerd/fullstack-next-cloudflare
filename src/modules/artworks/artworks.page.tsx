import { and, eq } from "drizzle-orm";
import { Suspense } from "react";
import { getDb } from "@/db";
import { ArtworkGallery } from "@/modules/artworks/components/artwork-gallery";
import { ArtworkGallerySkeleton } from "@/modules/artworks/components/artwork-gallery.skeleton";
import { WorkspaceBreadcrumb } from "@/modules/artworks/components/workspace-breadcrumb";
import { WorkspaceToolbar } from "@/modules/artworks/components/workspace-toolbar";
import { parseWorkspaceQuery } from "@/modules/artworks/models/workspace-item.model";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { UploadArtworkButton } from "@/components/navbar-upload";
import { CreateCollectionFab } from "@/modules/social/components/create-collection-dialog";
import {
    member,
    organization,
} from "@/modules/profiles/schemas/org-plugin.schema";

interface ArtworksPageProps {
    searchParams: Promise<Record<string, string | undefined>>;
    collectionId?: string;
}

export default async function ArtworksPage({
    searchParams,
    collectionId,
}: ArtworksPageProps) {
    const user = await requireAuth();
    const params = await searchParams;
    const query = parseWorkspaceQuery(params, collectionId);

    const db = await getDb();
    const [ownedOrg] = await db
        .select({ slug: organization.slug })
        .from(organization)
        .innerJoin(
            member,
            and(
                eq(member.organizationId, organization.id),
                eq(member.userId, user.id),
                eq(member.role, "owner"),
            ),
        )
        .limit(1);
    const profilePath = ownedOrg?.slug ? `/@${ownedOrg.slug}` : undefined;

    return (
        <div className="w-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 md:px-6 py-2 border-b border-gray-100 bg-white sticky top-[57px] z-10">
                <WorkspaceBreadcrumb collectionId={collectionId} />
                <Suspense fallback={null}>
                    <WorkspaceToolbar
                        sort={query.sort}
                        order={query.order}
                        visibility={query.visibility}
                        insideCollection={!!collectionId}
                    />
                </Suspense>
            </div>

            <div className="px-4 pt-6 pb-2 md:px-6 md:pt-6">
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                    My Artworks
                </h1>
                <p className="text-gray-600 text-sm md:text-base mt-1">
                    Upload, organize and manage your artwork
                </p>
            </div>

            <div className="px-2 pb-6">
                <Suspense fallback={<ArtworkGallerySkeleton />}>
                    <ArtworkGallery query={query} profilePath={profilePath} />
                </Suspense>
            </div>

            <div className="fixed bottom-6 right-6 flex items-center gap-3 z-50">
                <CreateCollectionFab collectionId={collectionId} />
                <UploadArtworkButton
                    text=""
                    className="w-14 h-14 rounded-full shadow-xl p-0 bg-black hover:bg-zinc-800 text-white hover:scale-105 transition-all"
                    size="lg"
                    iconClassName="h-10 w-10 scale-125"
                    collectionId={collectionId}
                />
            </div>
        </div>
    );
}
