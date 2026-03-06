import { ArrowDown } from "lucide-react";
import { getWorkspaceItemsAction } from "@/modules/artworks/actions/get-workspace-items.action";
import type { WorkspaceQuery } from "@/modules/artworks/models/workspace-item.model";
import { WorkspaceGrid } from "@/modules/artworks/components/workspace-grid";

interface ArtworkGalleryProps {
    query: WorkspaceQuery;
}

export async function ArtworkGallery({ query }: ArtworkGalleryProps) {
    const result = await getWorkspaceItemsAction(query);

    if (result.collections.length === 0 && result.artworks.length === 0) {
        return (
            <div className="fixed bottom-24 right-20 z-50 pointer-events-none animate-in fade-in duration-1000 delay-500">
                <div className="flex flex-col items-center animate-bounce">
                    <span className="text-red-500 font-bold text-xl -rotate-12 font-mono whitespace-nowrap drop-shadow-sm translate-x-14 -translate-y-2">
                        Upload artwork
                    </span>
                    <ArrowDown className="w-10 h-10 text-red-500 -rotate-[30deg] translate-x-20 mt-1" />
                </div>
            </div>
        );
    }

    return (
        <WorkspaceGrid
            collections={result.collections}
            initialArtworks={result.artworks}
            initialHasMore={result.hasMore}
            query={query}
        />
    );
}
