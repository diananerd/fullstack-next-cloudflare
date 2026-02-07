import { type NextRequest, NextResponse } from "next/server";
import { getAuthInstance as getAuth } from "@/modules/auth/utils/auth-utils";

export async function middleware(request: NextRequest) {
    try {
        // Validate session
        const auth = await getAuth();
        const session = await auth.api.getSession({
            headers: request.headers,
        });

        if (!session) {
            return NextResponse.redirect(new URL("/login", request.url));
        }

        return NextResponse.next();
    } catch (_error) {
        // If session validation fails, redirect to login
        return NextResponse.redirect(new URL("/login", request.url));
    }
}

export const config = {
    matcher: [
        "/artworks/:path*", // Protects /artworks and all sub-routes
    ],
};
