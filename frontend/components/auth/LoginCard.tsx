import type { ComponentProps } from "react";

import { AuthCard } from "@/components/auth/AuthCard";

/** The sign-in page: the same frame as every other account page, so signing in looks like the rest of Hirvello. */
export function LoginCard(props: Omit<ComponentProps<typeof AuthCard>, "wide">) {
  return <AuthCard {...props} />;
}
