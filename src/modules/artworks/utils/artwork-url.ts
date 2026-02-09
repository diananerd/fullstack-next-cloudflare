import { ProtectionStatus } from "../models/artwork.enum";
import type { Artwork } from "../schemas/artwork.schema";

export function getArtworkDisplayUrl(artwork: Artwork): string {
    // Priority: Try to show the protected image if it's likely to exist (Pipeline DONE)
    // We assume the standard structure {hash}/protected.png
    if (
        artwork.protectionStatus === ProtectionStatus.DONE && 
        artwork.r2Key
    ) {
        const parts = artwork.r2Key.split("/");
        if (parts.length > 0) {
            const hash = parts[0];
            return `/api/assets/${hash}/protected.png`;
        }
    }
    
    // Fallback to original
    return artwork.url;
}
