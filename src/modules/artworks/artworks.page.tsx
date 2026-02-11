import { Suspense } from "react";
import { ArtworkGallery } from "@/modules/artworks/components/artwork-gallery";
import { ArtworkGallerySkeleton } from "@/modules/artworks/components/artwork-gallery.skeleton";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { UploadArtworkButton } from "@/components/navbar-upload";

export default async function ArtworksPage() {
    await requireAuth();

    return (
        <div className="w-full">
            <div className="px-4 pt-6 pb-4 md:px-6 md:pt-6">
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                    My Artworks
                </h1>
                <p className="text-gray-600 text-sm md:text-base mt-1">
                    Manage and protect your visual artworks
                </p>
            </div>

            <div className="px-2 pb-6">
                <Suspense fallback={<ArtworkGallerySkeleton />}>
                    <ArtworkGallery />
                </Suspense>
            </div>

            <UploadArtworkButton
                text=""
                className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-xl z-50 p-0 bg-black hover:bg-zinc-800 text-white hover:scale-105 transition-all"
                size="lg"
                iconClassName="h-10 w-10 scale-125"
            />
        </div>
    );
}
