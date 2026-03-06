import { type NextRequest, NextResponse } from "next/server";
import { getAuthInstance as getAuth } from "@/modules/auth/utils/auth-utils";

const PROTECTED_PREFIXES = ["/artworks", "/billing", "/settings", "/profile"];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Rewrite /@username → /profile/username
    // Next.js App Router reserves @ for parallel route slots, so /@foo gives 404.
    // We intercept here and forward to the real route before any other logic.
    if (pathname.startsWith("/@")) {
        const rest = pathname.slice(2); // strip leading /@
        if (rest) {
            const url = request.nextUrl.clone();
            url.pathname = `/profile/${rest}`;
            return NextResponse.rewrite(url);
        }
    }

    // Only run auth check on protected routes
    const isProtected = PROTECTED_PREFIXES.some((prefix) =>
        pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    if (!isProtected) {
        return NextResponse.next();
    }

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
        // Match everything except static assets, images, and Next.js internals
        "/((?!_next/static|_next/image|favicon.ico|icon.png|manifest.json|sw.js|api/).*)",
    ],
};
