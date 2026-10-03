import { NextResponse, type NextRequest } from "next/server";

// TODO: refresh the Supabase session and route by role (ARCHITECTURE.md 10.1, 10.2 L1).
export function proxy(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/recruiter/:path*", "/candidate/:path*"],
};
