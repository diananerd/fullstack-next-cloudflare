import { ArtworkGallery } from "@/modules/artworks/components/artwork-gallery";

export default async function ArtworksPage() {
    return (
        <div className="w-full">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 p-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        My Artworks
                    </h1>
                    <p className="text-gray-600 mt-1">
                        Manage and protect your visual artworks
                    </p>
                </div>
            </div>

            <div className="px-2 pb-6">
                <ArtworkGallery />
            </div>
        </div>
    );
}
