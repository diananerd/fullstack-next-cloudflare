"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    COLLECTION_TITLE_MAX,
    validateCollectionTitle,
} from "@/modules/artworks/utils/collection-title";

interface CollectionNameFieldProps {
    id: string;
    value: string;
    error: string | null;
    onChange: (value: string, error: string | null) => void;
    placeholder?: string;
    hint?: string;
}

export function CollectionNameField({
    id,
    value,
    error,
    onChange,
    placeholder,
    hint,
}: CollectionNameFieldProps) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>Name</Label>
            <Input
                id={id}
                value={value}
                placeholder={placeholder}
                onChange={(e) => {
                    const val = e.target.value;
                    onChange(val, validateCollectionTitle(val));
                }}
                maxLength={COLLECTION_TITLE_MAX + 1}
                autoFocus
                autoComplete="off"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <p className="text-xs text-muted-foreground">
                {value.trim().length}/{COLLECTION_TITLE_MAX}
                {hint ? ` · ${hint}` : ""}
            </p>
        </div>
    );
}
