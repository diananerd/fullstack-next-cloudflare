"use client";

import { ArrowDownAZ, ArrowUpAZ, CalendarArrowDown, CalendarArrowUp, Clock } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SortField, SortOrder, VisibilityFilter } from "@/modules/artworks/models/workspace-item.model";

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
}

export function WorkspaceToolbar({
    sort,
    order,
    visibility,
}: WorkspaceToolbarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const update = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set(key, value);
        router.push(`${pathname}?${params.toString()}`);
    };

    const toggleOrder = () => update("order", order === "desc" ? "asc" : "desc");

    const OrderIcon =
        sort === "title"
            ? order === "asc"
                ? ArrowDownAZ
                : ArrowUpAZ
            : order === "asc"
              ? CalendarArrowUp
              : CalendarArrowDown;

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {/* Sort field */}
            <select
                value={sort}
                onChange={(e) => update("sort", e.target.value)}
                className="h-7 text-xs rounded-md border border-gray-200 bg-white px-2 text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-300"
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
                className="h-7 w-7 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:text-gray-800 hover:border-gray-300 transition-colors"
                aria-label={order === "asc" ? "Ascending" : "Descending"}
            >
                <OrderIcon className="h-3.5 w-3.5" />
            </button>

            {/* Visibility filter */}
            <select
                value={visibility}
                onChange={(e) => update("visibility", e.target.value)}
                className="h-7 text-xs rounded-md border border-gray-200 bg-white px-2 text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-300"
            >
                {(Object.keys(VISIBILITY_LABELS) as VisibilityFilter[]).map((v) => (
                    <option key={v} value={v}>
                        {VISIBILITY_LABELS[v]}
                    </option>
                ))}
            </select>
        </div>
    );
}
