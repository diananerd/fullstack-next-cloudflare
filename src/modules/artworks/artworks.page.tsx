import { Suspense } from "react";
import { ArtworkGallery } from "@/modules/artworks/components/artwork-gallery";
import { ArtworkGallerySkeleton } from "@/modules/artworks/components/artwork-gallery.skeleton";
import { WorkspaceBreadcrumb } from "@/modules/artworks/components/workspace-breadcrumb";
import { WorkspaceToolbar } from "@/modules/artworks/components/workspace-toolbar";
import { parseWorkspaceQuery } from "@/modules/artworks/models/workspace-item.model";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { UploadArtworkButton } from "@/components/navbar-upload";
import { CreateCollectionFab } from "@/modules/social/components/create-collection-dialog";

interface ArtworksPageProps {
    searchParams: Promise<Record<string, string | undefined>>;
    collectionId?: string;
}

export default async function ArtworksPage({
    searchParams,
    collectionId,
}: ArtworksPageProps) {
    await requireAuth();
    const params = await searchParams;
    const query = parseWorkspaceQuery(params, collectionId);

    return (
        <div className="w-full">
            <div className="px-4 pt-6 pb-2 md:px-6 md:pt-6">
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                    My Artworks
                </h1>
                <p className="text-gray-600 text-sm md:text-base mt-1">
                    Upload, organize and manage your artwork
                </p>
                <WorkspaceBreadcrumb collectionId={collectionId} />
            </div>

            <Suspense fallback={null}>
                <WorkspaceToolbar
                    sort={query.sort}
                    order={query.order}
                    visibility={query.visibility}
                />
            </Suspense>

            <div className="px-2 pb-6">
                <Suspense fallback={<ArtworkGallerySkeleton />}>
                    <ArtworkGallery query={query} />
                </Suspense>
            </div>

            <div className="fixed bottom-6 right-6 flex items-center gap-3 z-50">
                <CreateCollectionFab />
                <UploadArtworkButton
                    text=""
                    className="w-14 h-14 rounded-full shadow-xl p-0 bg-black hover:bg-zinc-800 text-white hover:scale-105 transition-all"
                    size="lg"
                    iconClassName="h-10 w-10 scale-125"
                />
            </div>
        </div>
    );
}
