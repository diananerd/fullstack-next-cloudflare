import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { artworks } from "./artwork.schema";
import {
    ProtectionMethod,
    type ProtectionMethodType,
} from "../models/artwork.enum";

// Enum para el estado individual del Job
export const JobStatus = {
    PENDING: "pending", // Creado en DB, esperando despacho
    QUEUED: "queued", // Despachado a Modal (tenemos ID externo)
    PROCESSING: "processing", // Modal reporta que está trabajando
    COMPLETED: "completed", // Terminado exitosamente
    FAILED: "failed", // Error
} as const;

export type JobStatusType = (typeof JobStatus)[keyof typeof JobStatus];

export const artworkJobs = sqliteTable(
    "artwork_jobs",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        artworkId: integer("artwork_id")
            .notNull()
            .references(() => artworks.id, { onDelete: "cascade" }),

        // External Job ID (Modal ID)
        externalId: text("external_id"),

        // Configuration used for this specific step
        method: text("method").$type<ProtectionMethodType>().notNull(),
        config: text("config", { mode: "json" })
            .$type<Record<string, any>>()
            .notNull()
            .default({}),

        // Order in the pipeline (0, 1, 2...)
        stepOrder: integer("step_order").notNull(),

        // Data Flow
        inputUrl: text("input_url").notNull(), // URL used as source
        outputUrl: text("output_url"), // Result URL
        outputKey: text("output_key"), // R2 Key of result

        status: text("status")
            .$type<JobStatusType>()
            .notNull()
            .default(JobStatus.PENDING),

        errorMessage: text("error_message"),
        meta: text("meta", { mode: "json" }).$type<any>(), // Latency, tokens, etc.

        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text("updated_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        index("idx_jobs_artwork_id").on(table.artworkId),
        index("idx_jobs_status").on(table.status),
        index("idx_jobs_external_id").on(table.externalId),
    ],
);
