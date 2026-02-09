import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export async function getDb(envOverride?: Cloudflare.Env) {
    console.log("[DB] Initializing...");
    try {
        let env: Cloudflare.Env;
        if (envOverride) {
            env = envOverride;
        } else {
            console.log("[DB] Fetching Cloudflare Context...");
            const context = await getCloudflareContext();
            env = context.env as unknown as Cloudflare.Env;
        }

        console.log(
            "[DB] Env fetched. DB Binding exists:",
            !!env.drimit_shield_db,
        );
        return drizzle(env.drimit_shield_db, { schema });
    } catch (e) {
        console.error("[DB] Initialization Failed:", e);
        throw e;
    }
}

export * from "./schema";
