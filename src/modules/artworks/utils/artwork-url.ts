import { ProtectionStatus } from "../models/artwork.enum";
import type { Artwork } from "../schemas/artwork.schema";

export function getArtworkDisplayUrl(artwork: Artwork): string {
    // Priority: Try to show the protected image if it's likely to exist (Pipeline DONE)
    // We assume the standard structure {userId}/{hash}/protected.png (new) or {hash}/protected.png (old)
    if (artwork.protectionStatus === ProtectionStatus.DONE && artwork.r2Key) {
        // Replace 'original' with 'protected' in the key
        // Current key: {userId}/{hash}/original.ext
        // Target: {userId}/{hash}/protected.png
        // We can just swap the filename since we force 'original' name.

        // Note: The extension might vary, so we replace based on directory logic or standard name
        const lastSlashIndex = artwork.r2Key.lastIndexOf("/");
        if (lastSlashIndex !== -1) {
            const prefix = artwork.r2Key.substring(0, lastSlashIndex); // {userId}/{hash}
            return `/api/assets/${prefix}/protected.png`;
        }
    }

    // Fallback to original
    return artwork.url;
}
