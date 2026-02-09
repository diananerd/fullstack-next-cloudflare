import { ProtectionStatus } from "../models/artwork.enum";
import type { Artwork } from "../schemas/artwork.schema";

export function getArtworkDisplayUrl(artwork: Artwork): string {
    if (
        artwork.protectionStatus === ProtectionStatus.DONE &&
        !!artwork.jobId
    ) {
        try {
            // New Structure: {hash}/original.{ext} -> {hash}/mist-v2.png
            const parts = artwork.r2Key.split("/");
            if (parts.length > 0) {
                const hash = parts[0];
                return `/api/assets/${hash}/mist-v2.png`;
            }
        } catch (e) {
            console.error("Failed to derive protected URL", e);
            return artwork.url; // Fallback
        }
    }
    return artwork.url;
}
