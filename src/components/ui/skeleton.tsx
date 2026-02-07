import { cn } from "@/lib/utils";
import type * as React from "react";

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "animate-pulse rounded-md bg-muted/10 bg-gray-200",
                className,
            )}
            {...props}
        />
    );
}

export { Skeleton };
