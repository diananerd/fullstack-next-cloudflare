import { Home } from "lucide-react";
import Link from "next/link";
import { resolveCollectionPath } from "@/modules/artworks/actions/get-workspace-items.action";

interface WorkspaceBreadcrumbProps {
    collectionId?: string;
    /** Root link. Defaults to "/artworks". Public profiles pass "/@slug". */
    basePath?: string;
}

export async function WorkspaceBreadcrumb({
    collectionId,
    basePath = "/artworks",
}: WorkspaceBreadcrumbProps) {
    const ancestors = collectionId
        ? await resolveCollectionPath(collectionId)
        : [];

    return (
        <nav className="flex items-center gap-1.5 text-sm flex-wrap">
            <Link
                href={basePath}
                className="text-gray-400 hover:text-gray-700 transition-colors flex items-center"
                aria-label="Home"
            >
                <Home className="h-3.5 w-3.5" />
            </Link>
            {ancestors.map((seg, i) => {
                const isLast = i === ancestors.length - 1;
                const href = `${basePath}?collectionId=${seg.id}`;
                return (
                    <span key={seg.id} className="flex items-center gap-1.5">
                        <span className="text-gray-300">/</span>
                        {isLast ? (
                            <span className="text-gray-700 font-medium truncate max-w-[160px]">
                                {seg.title}
                            </span>
                        ) : (
                            <Link
                                href={href}
                                className="text-gray-400 hover:text-gray-700 transition-colors truncate max-w-[120px]"
                            >
                                {seg.title}
                            </Link>
                        )}
                    </span>
                );
            })}
        </nav>
    );
}
