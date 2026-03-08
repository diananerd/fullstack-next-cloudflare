import { Suspense } from "react";
import { parseWorkspaceQuery } from "@/modules/artworks/models/workspace-item.model";
import { getDiscoverWorkspaceItemsAction } from "@/modules/artworks/actions/get-discover-workspace-items.action";
import { WorkspaceToolbar } from "@/modules/artworks/components/workspace-toolbar";
import { WorkspaceBreadcrumb } from "@/modules/artworks/components/workspace-breadcrumb";
import { ArtworkGallerySkeleton } from "@/modules/artworks/components/artwork-gallery.skeleton";
import { DiscoverWorkspaceGrid } from "@/modules/artworks/components/discover-workspace-grid";

export default async function DiscoverPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const params = await searchParams;
    const collectionId = params.collectionId;
    const query = parseWorkspaceQuery(params, collectionId);

    const initialResult = await getDiscoverWorkspaceItemsAction(query);

    return (
        <div className="w-full">
            {/* Breadcrumb + Filters bar — sticky below Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 md:px-6 py-2 border-b border-gray-100 bg-white sticky top-[57px] z-10">
                <WorkspaceBreadcrumb
                    collectionId={collectionId}
                    basePath="/discover"
                    rootIcon="globe"
                />
                <Suspense fallback={null}>
                    <WorkspaceToolbar
                        sort={query.sort}
                        order={query.order}
                        visibility="public"
                        insideCollection={!!collectionId}
                        hideVisibility={true}
                    />
                </Suspense>
            </div>

            {/* Title + Description */}
            <div className="px-4 pt-6 pb-2 md:px-6 md:pt-6">
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                    Discover
                </h1>
                <p className="text-gray-600 text-sm md:text-base mt-1">
                    Explore public artworks and collections from creators on
                    Drimit
                </p>
            </div>

            {/* Gallery */}
            <div className="px-2 pb-6">
                <Suspense fallback={<ArtworkGallerySkeleton />}>
                    {initialResult.items.length === 0 ? (
                        <p className="text-sm text-gray-400 px-4 py-8 text-center">
                            No public artworks yet.
                        </p>
                    ) : (
                        <DiscoverWorkspaceGrid
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
