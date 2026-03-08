import { Suspense } from "react";
import { parseWorkspaceQuery } from "@/modules/artworks/models/workspace-item.model";
import { getDiscoverItemsAction } from "@/modules/artworks/actions/get-discover-items.action";
import { WorkspaceToolbar } from "@/modules/artworks/components/workspace-toolbar";
import { ArtworkGallerySkeleton } from "@/modules/artworks/components/artwork-gallery.skeleton";
import { DiscoverGrid } from "@/modules/artworks/components/discover-grid";
import type { DiscoverItem } from "@/modules/artworks/actions/get-discover-items.action";

export default async function DiscoverPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const params = await searchParams;
    const { sort, order, offset, limit } = parseWorkspaceQuery(params);
    const query = { sort, order, offset, limit };

    const initialResult = await getDiscoverItemsAction(query);

    return (
        <div className="w-full">
            {/* Title + Filters bar — sticky below Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 md:px-6 py-2 border-b border-gray-100 bg-white sticky top-[57px] z-10">
                <span className="text-sm font-medium text-gray-700">
                    Discover
                </span>
                <Suspense fallback={null}>
                    <WorkspaceToolbar
                        sort={sort}
                        order={order}
                        visibility="public"
                        insideCollection={false}
                        hideVisibility={true}
                    />
                </Suspense>
            </div>

            {/* Gallery */}
            <div className="px-2 pb-6 pt-4">
                <Suspense fallback={<ArtworkGallerySkeleton />}>
                    {initialResult.items.length === 0 ? (
                        <p className="text-sm text-gray-400 px-4 py-8 text-center">
                            No public artworks yet.
                        </p>
                    ) : (
                        <DiscoverGrid
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
