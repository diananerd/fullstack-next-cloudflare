import { Skeleton } from "@/components/ui/skeleton";

export function ArtworkGallerySkeleton() {
    return (
        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6 gap-4 space-y-4">
            {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="break-inside-avoid mb-4">
                    <Skeleton
                        className={`w-full rounded-lg ${
                            i % 2 === 0 ? "h-64" : "h-48"
                        }`}
                    />
                </div>
            ))}
        </div>
    );
}
