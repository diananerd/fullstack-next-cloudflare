"use client";

import { Folder, FolderOpen, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Collection } from "@/modules/social/schemas/collection.schema";

interface CollectionCardProps {
    collection: Collection;
    role: string;
    parentId?: string; // if inside another collection
}

export function CollectionCard({ collection }: CollectionCardProps) {
    const router = useRouter();
    const href = `/artworks?collectionId=${collection.id}`;

    return (
        <button
            type="button"
            onClick={() => router.push(href)}
            className="w-full text-left group rounded-2xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-md transition-all duration-150 overflow-hidden"
        >
            {/* Cover area — folder visual */}
            <div className="bg-gray-50 group-hover:bg-gray-100 transition-colors flex items-center justify-center aspect-[4/3] relative">
                <FolderOpen className="h-12 w-12 text-gray-300 group-hover:text-gray-400 transition-colors" />
                {collection.visibility === "private" && (
                    <Lock className="absolute top-3 right-3 h-3.5 w-3.5 text-gray-400" />
                )}
            </div>
            {/* Info */}
            <div className="px-3 py-2.5">
                <p className="text-sm font-medium text-gray-900 truncate leading-tight">
                    {collection.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                    {collection.itemCount === 0
                        ? "Empty"
                        : `${collection.itemCount} item${collection.itemCount !== 1 ? "s" : ""}`}
                </p>
            </div>
        </button>
    );
}
