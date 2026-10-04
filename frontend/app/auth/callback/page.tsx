import type { Metadata } from "next";

import { AuthCallback } from "@/components/auth/AuthCallback";

export const metadata: Metadata = { title: "Signing you in" };

// Where Supabase sends an invited candidate after verifying their invitation link (backend
// settings.portal_invite_redirect_url). The session is in the URL fragment, so the work happens in the browser.
export default function AuthCallbackPage() {
  return <AuthCallback />;
}
