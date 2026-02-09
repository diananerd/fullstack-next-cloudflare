"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
// import { sendToQueue } from "@/lib/queue"; // DEPRECATED
import { deleteFromR2, type UploadResult, uploadToR2 } from "@/lib/r2";
import {
    type ProtectionMethodType,
    ProtectionStatus,
    type ProtectionStatusType,
} from "@/modules/artworks/models/artwork.enum";
import {
    artworks,
    insertArtworkSchema,
} from "@/modules/artworks/schemas/artwork.schema";
import { requireAuth } from "@/modules/auth/utils/auth-utils";

// Temporary route definition until we have a proper route file
const DASHBOARD_ROUTE = "/artworks";

// Constants for validation
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png"];

export async function createArtworkAction(formData: FormData) {
    try {
        const hash = formData.get("hash") as string;
        console.log(
            `[CreateArtworkAction] Starting action for ${hash || "unknown"}`,
        );

        const user = await requireAuth();

        const imageFile = formData.get("image") as File | null;
        console.log(
            `[CreateArtworkAction] Validating file. Size: ${imageFile?.size}, Type: ${imageFile?.type}`,
        );

        if (!imageFile || imageFile.size === 0) {
            return { success: false, error: "Image file is required" };
        }

        // Validate File Type
        if (!ALLOWED_FILE_TYPES.includes(imageFile.type)) {
            return {
                success: false,
                error: "Invalid file type. Only PNG and JPEG images are allowed.",
            };
        }

        // Enterprise-grade: Magic Bytes Verification
        // File.type is trustable only to an extent (user provided). We check the first bytes.
        const arrayBuffer = await imageFile.slice(0, 4).arrayBuffer();
        const header = new Uint8Array(arrayBuffer);
        let validMagicBytes = false;

        // PNG: 89 50 4E 47
        if (
            header[0] === 0x89 &&
            header[1] === 0x50 &&
            header[2] === 0x4e &&
            header[3] === 0x47
        ) {
            validMagicBytes = true;
        }
        // JPEG: FF D8 FF
        else if (
            header[0] === 0xff &&
            header[1] === 0xd8 &&
            header[2] === 0xff
        ) {
            validMagicBytes = true;
        }

        if (!validMagicBytes) {
            return {
                success: false,
                error: "Invalid file content. The file does not appear to be a genuine Image.",
            };
        }

        // Validate File Size
        if (imageFile.size > MAX_FILE_SIZE) {
            return {
                success: false,
                error: `File size exceeds the limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
            };
        }

        if (!hash) {
            return {
                success: false,
                error: "File hash is required for integrity verification.",
            };
        }

        console.log(`[CreateArtworkAction] Uploading raw image to R2: ${hash}`);

        // Upload to R2: {hash}/original.{ext}
        const uploadResult: UploadResult = await uploadToR2(
            imageFile,
            hash,
            "original",
        );

        if (!uploadResult.success || !uploadResult.key || !uploadResult.url) {
            console.error(
                `[CreateArtworkAction] R2 Upload failed: ${uploadResult.error}`,
            );
            return {
                success: false,
                error: uploadResult.error || "Failed to upload image",
            };
        }

        console.log(
            `[CreateArtworkAction] Upload success. Key: ${uploadResult.key}`,
        );

        const title = formData.get("title") as string;
        const descriptionRaw = formData.get("description");
        const description = descriptionRaw
            ? (descriptionRaw as string)
            : undefined;
        // Default to mist if not provided.
        // We will expose this in the UI later, but the backend must support it now.
        const method = (formData.get("method") as string) || "mist";

        // Validate and Prepare data
        // We let Zod parse it, but we need to supply the R2 data

        const artworkData = {
            title: title || "Untitled",
            description: description,
            userId: user.id,
            r2Key: uploadResult.key,
            url: uploadResult.url,
            protectionStatus: ProtectionStatus.DONE,
            size: imageFile.size,
            method: method,
        };

        const validatedData = insertArtworkSchema.parse(artworkData);
        // Explicit cast to fix Drizzle type inference issue with Zod optional enums
        const safeData = {
            title: validatedData.title,
            description: validatedData.description,
            userId: validatedData.userId,
            r2Key: validatedData.r2Key,
            url: validatedData.url,
            protectionStatus: ProtectionStatus.DONE,
            size: validatedData.size,
            method: validatedData.method as ProtectionMethodType,
            // Explicitly exclude ID
        };

        const db = await getDb();
        console.log(
            `[CreateArtworkAction] Saving to DB. User: ${user.id}, Key: ${uploadResult.key}`,
        );

        // biome-ignore lint/suspicious/noExplicitAny: DB result type
        let result: any;
        try {
            result = await db
                .insert(artworks)
                .values(safeData)
                .returning({ insertedId: artworks.id });

            console.log(
                `[CreateArtworkAction] DB Insert Success. Result: ${JSON.stringify(result)}`,
            );
        } catch (dbError) {
            console.error(
                `[CreateArtworkAction] DB Insert Failed: ${dbError}. Cleaning up R2...`,
            );
            if (uploadResult.key) {
                await deleteFromR2(uploadResult.key);
            }
            throw new Error("Database error: Failed to save artwork metadata.");
        }

        const newArtworkId = result[0]?.insertedId;

        if (newArtworkId) {
             console.log(`[CreateArtworkAction] Artwork created with ID: ${newArtworkId}. Status: DONE`);
        } else {
            console.error(
                `[CreateArtworkAction] No ID returned from DB insert!`,
            );
        }

        revalidatePath(DASHBOARD_ROUTE);

        return { success: true };
    } catch (error: unknown) {
        console.error(`[CreateArtworkAction] Critical Error:`, error);
        // Return Zod errors if available
        // biome-ignore lint/suspicious/noExplicitAny: Zod error check
        if ((error as any).flatten) {
            // biome-ignore lint/suspicious/noExplicitAny: Zod error check
            return {
                success: false,
                errors: (error as any).flatten().fieldErrors,
            };
        }
        return {
            success: false,
            error: (error as Error).message || "Failed to create artwork",
        };
    }
}
