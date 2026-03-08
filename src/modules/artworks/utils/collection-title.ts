/**
 * Shared validation for collection titles — used by both server actions and client forms.
 * Source of truth: any change here propagates everywhere automatically.
 */

/** Allowed chars: Unicode letters (incl. accents), digits, spaces, apostrophe, hyphen, period, comma. */
export const COLLECTION_TITLE_PATTERN = /^[\p{L}\p{N}\s'\-\.,]+$/u;

export const COLLECTION_TITLE_MAX = 50;

/**
 * Validates a raw collection title value.
 * Returns an error string, or null if valid.
 * Empty string returns null — "no error while typing" UX.
 */
export function validateCollectionTitle(raw: string): string | null {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > COLLECTION_TITLE_MAX)
        return `${COLLECTION_TITLE_MAX} characters max.`;
    if (!COLLECTION_TITLE_PATTERN.test(trimmed))
        return "Only letters, numbers, spaces, and ' - . , are allowed.";
    return null;
}

/**
 * Normalizes a raw title (trim + collapse internal whitespace).
 * Returns { ok, title } or { ok, error }.
 */
export function parseCollectionTitle(
    raw: string,
): { ok: true; title: string } | { ok: false; error: string } {
    const title = raw.trim().replace(/\s+/g, " ");
    if (title.length === 0) return { ok: false, error: "Name is required." };
    const err = validateCollectionTitle(title);
    if (err) return { ok: false, error: err };
    return { ok: true, title };
}
