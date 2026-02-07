"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { type UploadResult, uploadToR2, deleteFromR2 } from "@/lib/r2";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import {
    insertArtworkSchema,
    artworks,
} from "@/modules/artworks/schemas/artwork.schema";
import {
    ProtectionStatus,
    ProtectionStatusType,
} from "@/modules/artworks/models/artwork.enum";

// Temporary route definition until we have a proper route file
const DASHBOARD_ROUTE = "/artworks";

// Constants for validation
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png"];

export async function createArtworkAction(formData: FormData) {
    try {
        const user = await requireAuth();

        const imageFile = formData.get("image") as File | null;

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

        const hash = formData.get("hash") as string;
        if (!hash) {
            return {
                success: false,
                error: "File hash is required for integrity verification.",
            };
        }

        // Upload to R2 (raw folder) with HASH as filename
        const uploadResult: UploadResult = await uploadToR2(
            imageFile,
            "raw",
            hash,
        );

        if (!uploadResult.success || !uploadResult.key || !uploadResult.url) {
            return {
                success: false,
                error: uploadResult.error || "Failed to upload image",
            };
        }

        const title = formData.get("title") as string;
        const descriptionRaw = formData.get("description");
        const description = descriptionRaw
            ? (descriptionRaw as string)
            : undefined;

        // Validate and Prepare data
        // We let Zod parse it, but we need to supply the R2 data

        const artworkData = {
            title: title || "Untitled",
            description: description,
            userId: user.id,
            r2Key: uploadResult.key,
            url: uploadResult.url,
            protectionStatus: ProtectionStatus.PENDING,
            size: imageFile.size,
        };

        const validatedData = insertArtworkSchema.parse(artworkData);
        // Explicit cast to fix Drizzle type inference issue with Zod optional enums
        const safeData = {
            title: validatedData.title,
            description: validatedData.description,
            userId: validatedData.userId,
            r2Key: validatedData.r2Key,
            url: validatedData.url,
            protectionStatus:
                validatedData.protectionStatus as ProtectionStatusType,
            size: validatedData.size,
            // Explicitly exclude ID
        };

        const db = await getDb();
        let result;
        try {
            result = await db
                .insert(artworks)
                .values(safeData)
                .returning({ insertedId: artworks.id });
        } catch (dbError) {
            console.error("DB Insert Failed, cleaning up R2...", dbError);
            if (uploadResult.key) {
                await deleteFromR2(uploadResult.key);
            }
            throw new Error("Database error: Failed to save artwork metadata.");
        }

        const newArtworkId = result[0]?.insertedId;

        // Trigger Mock GPU Processing (Fire and Forget-ish)
        // Since we are in an action, we can't easily do fire-and-forget without holding up the response
        // in some environments, but we'll try to just fetch without awaiting the result fully?
        // Actually, best practice in Next.js Server Actions is usually to await, or offload to a queue.
        // For this Hackathon/MVP: we will fetch async but NOT await the response body, just trigger it.
        // BUT, Next.js serverless functions might die if we don't await.
        // So we will await the fetch call initiation.

        if (newArtworkId) {
            const appUrl =
                process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
            // Await the fetch to ensure it fires in the serverless environment
            console.log(
                `Triggering mock GPU at ${appUrl}/api/mock-gpu/process for ID ${newArtworkId}`,
            );
            await fetch(`${appUrl}/api/mock-gpu/process`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    artworkId: newArtworkId,
                    fileUrl: uploadResult.url,
                }),
            }).catch((err) =>
                console.error("Failed to trigger mock GPU:", err),
            );
        }

        revalidatePath(DASHBOARD_ROUTE);

        return { success: true };
    } catch (error: any) {
        console.error("Create artwork error:", error);
        // Return Zod errors if available
        if (error.flatten) {
            return { success: false, errors: error.flatten().fieldErrors };
        }
        return {
            success: false,
            error: error.message || "Failed to create artwork",
        };
    }
}
