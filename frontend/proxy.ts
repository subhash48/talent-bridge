import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SUPABASE_CONFIGURED, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase";
import { USE_MOCK_API } from "@/services/api";

const PROTECTED = ["/recruiter", "/candidate"];

/**
 * Runs before every page: refreshes the Supabase session cookies when the access token has expired,
 * and sends signed-out visitors of the portals to /login. Which portal someone may use is decided by
 * their role, which the layouts ask the API for (lib/session.ts); the API enforces it on every request.
 */
export async function proxy(request: NextRequest) {
  // Mock mode is a frontend-only preview with seeded fake data and no API to protect.
  if (USE_MOCK_API) return NextResponse.next({ request });

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
