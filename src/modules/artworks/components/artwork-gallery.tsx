import { getArtworksAction } from "../actions/get-artworks.action";
import { AlertCircle } from "lucide-react";
import { Artwork } from "@/modules/artworks/schemas/artwork.schema";
import { ProtectionStatus } from "@/modules/artworks/models/artwork.enum";
import { UploadArtworkButton } from "@/components/navbar-upload";
import { ArtworkMasonry } from "./artwork-masonry";

export async function ArtworkGallery() {
    const { data: artworks, error } = await getArtworksAction();

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
                <strong className="font-bold">Error! </strong>
                <span className="block sm:inline">{error}</span>
            </div>
        );
    }

    if (!artworks || artworks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
                <div>
                    <p className="text-gray-500 text-lg font-medium">No protected artworks yet.</p>
                    <p className="text-gray-400">Upload one to get started!</p>
                </div>
                <UploadArtworkButton text="Upload First Artwork" size="lg" />
            </div>
        );
    }

    return (
        <ArtworkMasonry artworks={artworks} />
    );
}
