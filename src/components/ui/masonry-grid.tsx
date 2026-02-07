"use client";

import { useEffect, useState, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MasonryGridProps<T> {
    items: T[];
    render: (item: T) => ReactNode;
    className?: string;
    keyExtractor?: (item: T) => string | number;
}

export function MasonryGrid<T>({ items, render, className, keyExtractor }: MasonryGridProps<T>) {
    const [columns, setColumns] = useState(1);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const updateColumns = () => {
            const width = window.innerWidth;
            if (width >= 1536) setColumns(6); // 2xl
            else if (width >= 1280) setColumns(5); // xl
            else if (width >= 1024) setColumns(4); // lg
            else if (width >= 768) setColumns(3); // md
            else if (width >= 640) setColumns(2); // sm
            else setColumns(1);
        };

        updateColumns();
        setMounted(true);
        window.addEventListener("resize", updateColumns);
        return () => window.removeEventListener("resize", updateColumns);
    }, []);

    const getColumns = () => {
        const cols = Array.from({ length: columns }, () => [] as T[]);
        items.forEach((item, index) => {
            cols[index % columns].push(item);
        });
        return cols;
    };

    // Server-side / Initial render: just render a simple grid or list to avoid layout shift if possible?
    // Or just render empty?
    // Better to render something. If we render 1 column (mobile mobile), it's safe.
    // Ideally we match the SSR columns-1.
    // To properly support SSR with this is hard without knowing the device. 
    // We will accept the client-side adjust.

    if (!mounted) {
        // Fallback for SSR - Render strictly vertical list (1 column) or use CSS columns as interim?
        // Using the original CSS columns approach for SSR would be cool to minimize CLS, 
        // but the ordering would change from Vertical to Horizontal-Masonry upon hydration.
        // Let's stick to 1-col default to ensure data is visible.
        return (
            <div className={cn("flex flex-col gap-4 p-4", className)}>
                  {items.map((item, i) => (
                      <div key={i}>{render(item)}</div>
                  ))}
            </div>
        );
    }

    const distributedColumns = getColumns();

    return (
        <div className={cn("flex gap-4 p-4", className)}>
            {distributedColumns.map((colItems, colIndex) => (
                <div key={colIndex} className="flex flex-col gap-4 flex-1">
                    {colItems.map((item, i) => (
                         // unique key hack? relying on index is okay for this display-only list usually, 
                         // but standard would be better. We don't have id access here though.
                         // wrapping div needs key.
                        <div key={keyExtractor ? keyExtractor(item) : i}>
                            {render(item)}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}
