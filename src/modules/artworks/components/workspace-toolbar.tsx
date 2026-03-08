"use client";

import {
    ArrowDownAZ,
    ArrowUpAZ,
    CalendarArrowDown,
    CalendarArrowUp,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
    SortField,
    SortOrder,
    VisibilityFilter,
} from "@/modules/artworks/models/workspace-item.model";

const SORT_LABELS: Record<SortField, string> = {
    createdAt: "Date added",
    updatedAt: "Last modified",
    title: "Name",
};

const VISIBILITY_LABELS: Record<VisibilityFilter, string> = {
    all: "All",
    public: "Public",
    private: "Private",
};

interface WorkspaceToolbarProps {
    sort: SortField;
    order: SortOrder;
    visibility: VisibilityFilter;
    /** When true (inside a collection), sort/order controls are disabled.
     *  Order is controlled by drag-and-drop position inside folders. */
    insideCollection?: boolean;
    /** When true, the visibility filter is hidden (e.g. on public profile pages). */
    hideVisibility?: boolean;
}

export function WorkspaceToolbar({
    sort,
    order,
    visibility,
    insideCollection = false,
    hideVisibility = false,
}: WorkspaceToolbarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const update = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set(key, value);
        router.push(`${pathname}?${params.toString()}`);
    };

    const toggleOrder = () =>
        update("order", order === "desc" ? "asc" : "desc");

    const OrderIcon =
        sort === "title"
            ? order === "asc"
                ? ArrowDownAZ
                : ArrowUpAZ
            : order === "asc"
              ? CalendarArrowUp
              : CalendarArrowDown;

    const disabledClass = "opacity-40 cursor-not-allowed pointer-events-none";

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {/* Sort field */}
            <select
                value={sort}
                disabled={insideCollection}
                onChange={(e) => update("sort", e.target.value)}
                title={
                    insideCollection
                        ? "Order by drag & drop inside folders"
                        : undefined
                }
                className={`h-7 text-xs rounded-md border border-gray-200 bg-white px-2 text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-300 ${insideCollection ? disabledClass : ""}`}
            >
                {(Object.keys(SORT_LABELS) as SortField[]).map((s) => (
                    <option key={s} value={s}>
                        {SORT_LABELS[s]}
                    </option>
                ))}
            </select>

            {/* Sort order toggle */}
            <button
                type="button"
                onClick={toggleOrder}
                disabled={insideCollection}
                title={
                    insideCollection
                        ? "Order by drag & drop inside folders"
                        : undefined
                }
                className={`h-7 w-7 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:text-gray-800 hover:border-gray-300 transition-colors ${insideCollection ? disabledClass : ""}`}
                aria-label={order === "asc" ? "Ascending" : "Descending"}
            >
                <OrderIcon className="h-3.5 w-3.5" />
            </button>

            {/* Visibility filter */}
            {!hideVisibility && (
                <select
                    value={visibility}
                    onChange={(e) => update("visibility", e.target.value)}
                    className="h-7 text-xs rounded-md border border-gray-200 bg-white px-2 text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-300"
                >
                    {(Object.keys(VISIBILITY_LABELS) as VisibilityFilter[]).map(
                        (v) => (
                            <option key={v} value={v}>
                                {VISIBILITY_LABELS[v]}
                            </option>
                        ),
                    )}
                </select>
            )}
        </div>
    );
}
