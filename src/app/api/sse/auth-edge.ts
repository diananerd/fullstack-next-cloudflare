import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { session, user } from "@/modules/auth/schemas/auth.schema";
import { eq } from "drizzle-orm";

export async function verifySessionEdge(req: NextRequest) {
    // 1. Get token from cookie
    // Better-auth usually uses "better-auth.session_token" or just "session_token"
    // We check both just in case, or inspect the cookie header manually
    const token = req.cookies.get("better-auth.session_token")?.value || 
                  req.cookies.get("session_token")?.value;

    if (!token) return null;

    // 2. Query DB directly
    const db = await getDb();
    const sessionResult = await db.query.session.findFirst({
        where: eq(session.token, token),
        with: {
            // we need user id
            // Drizzle query API for "session" table
        }
    });

    if (!sessionResult) return null;

    // 3. Check expiration
    if (sessionResult.expiresAt < new Date()) {
        return null;
    }

    return {
        user: {
            id: sessionResult.userId
        }
    };
}
