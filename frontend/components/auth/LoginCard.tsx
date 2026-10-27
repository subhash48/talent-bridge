import type { ReactNode } from "react";

import { AuthCard } from "@/components/auth/AuthCard";

type LoginCardProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

/** The sign-in page: the same frame as every other account page, so signing in looks like the rest of Kavuntra. */
export function LoginCard(props: LoginCardProps) {
  return <AuthCard {...props} />;
}
