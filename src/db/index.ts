import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export async function getDb(envOverride?: Cloudflare.Env) {
    let env: Cloudflare.Env;
    if (envOverride) {
        env = envOverride;
    } else {
        const context = await getCloudflareContext();
        env = context.env as unknown as Cloudflare.Env;
    }
    
    // !starterconf - update this to match your D1 database binding name
    // change "next_cf_app" to your D1 database binding name on `wrangler.jsonc`
    return drizzle(env.drimit_shield_db, { schema });
}

export * from "./schema";
