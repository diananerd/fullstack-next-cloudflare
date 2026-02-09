import { Suspense } from "react";
import { ArtworkGallery } from "@/modules/artworks/components/artwork-gallery";
import { ArtworkGallerySkeleton } from "@/modules/artworks/components/artwork-gallery.skeleton";

export default async function ArtworksPage() {
    return (
        <div className="w-full">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 px-4 pt-6 pb-4 md:gap-4 md:px-6 md:pt-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        My Artworks
                    </h1>
                    <p className="text-gray-600 mt-1 text-sm md:text-base">
                        Manage and protect your visual artworks
                    </p>
                </div>
            </div>

            <div className="px-2 pb-6">
                <Suspense fallback={<ArtworkGallerySkeleton />}>
                    <ArtworkGallery />
                </Suspense>
            </div>
        </div>
    );
}
