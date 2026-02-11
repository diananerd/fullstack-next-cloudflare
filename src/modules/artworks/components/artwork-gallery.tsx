import { UploadArtworkButton } from "@/components/navbar-upload";
import { getArtworksAction } from "../actions/get-artworks.action";
import { ArtworkMasonry } from "./artwork-masonry";
import { ArrowDown } from "lucide-react";
import { EmptyArtworksState } from "./empty-artworks-state";

export async function ArtworkGallery() {
    const { data: artworks, error } = await getArtworksAction();

    if (error) {
        return (
            <div
                className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative"
                role="alert"
            >
                <strong className="font-bold">Error! </strong>
                <span className="block sm:inline">{error}</span>
            </div>
        );
    }

    if (!artworks || artworks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 relative">
                <div className="fixed bottom-24 right-20 z-50 pointer-events-none animate-in fade-in duration-1000 delay-500">
                    <div className="flex flex-col items-center animate-bounce">
                        <span className="text-red-500 font-bold text-xl -rotate-12 font-mono whitespace-nowrap drop-shadow-sm translate-x-14 -translate-y-2">
                            Upload artwork
                        </span>
                        <ArrowDown className="w-10 h-10 text-red-500 -rotate-[30deg] translate-x-20 mt-1" />
                    </div>
                </div>

                <EmptyArtworksState />
            </div>
        );
    }

    return <ArtworkMasonry artworks={artworks} />;
}
