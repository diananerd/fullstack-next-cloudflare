
import { ProtectionStatus } from "../models/artwork.enum";
import type { Artwork } from "../schemas/artwork.schema";

export function getArtworkDisplayUrl(artwork: Artwork): string {
    if (artwork.protectionStatus === ProtectionStatus.PROTECTED) {
        // Derive protected URL from the original R2 Key
        // Assumption: Original is "raw/{hash}.{ext}"
        // Protected is "protected/{hash}.png"
        try {
            const parts = artwork.r2Key.split("/");
            const filename = parts[parts.length - 1]; // hash.ext
            const hash = filename.split(".")[0]; // hash
            
            // Return relative path to asset proxy
            return `/api/assets/protected/${hash}.png`;
        } catch (e) {
            console.error("Failed to derive protected URL", e);
            return artwork.url; // Fallback
        }
    }
    return artwork.url;
}
