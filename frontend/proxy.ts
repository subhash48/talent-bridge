import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SUPABASE_CONFIGURED, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase";
import { USE_MOCK_API } from "@/services/api";

const PROTECTED = ["/recruiter", "/candidate", "/hire"];

/**
 * Runs before every page: refreshes the Supabase session cookies when the access token has expired,
 * and sends signed-out visitors of the portals to /login. Which portal someone may use is decided by
 * their role, which the layouts ask the API for (lib/session.ts); the API enforces it on every request.
 */
export async function proxy(request: NextRequest) {
  // Mock mode is a frontend-only preview with seeded fake data and no API to protect.
  if (USE_MOCK_API) return NextResponse.next({ request });

  // Supabase sends a Google sign-in or an emailed link to its Site URL, the home page, when the address we asked
  // for isn't on its Redirect URLs list. It still carries the code (or the error), so hand it to /auth/confirm,
  // which finishes it where it was going (lib/auth.ts AUTH_NEXT_COOKIE) instead of leaving it on the home page.
  const params = request.nextUrl.searchParams;
  if (request.nextUrl.pathname === "/" && ["code", "token_hash", "error", "error_description"].some((key) => params.has(key))) {
    return NextResponse.redirect(new URL(`/auth/confirm${request.nextUrl.search}`, request.url));
  }

  let response = NextResponse.next({ request });
  let signedIn = false;
  if (SUPABASE_CONFIGURED) {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          // Refreshed tokens go to this request (so the page renders with them) and to the browser.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    });
    // Verifies the access token's signature, refreshing the session first if it has expired.
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims);
  }

  const { pathname, search } = request.nextUrl;
  if (!signedIn && PROTECTED.some((area) => pathname === area || pathname.startsWith(`${area}/`))) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    const redirect = NextResponse.redirect(login);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  return response;
}

export const config = {
  // Everything but Next's static files and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
