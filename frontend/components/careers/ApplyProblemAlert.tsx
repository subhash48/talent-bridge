import Link from "next/link";

import { AuthAlert } from "@/components/auth/AuthAlert";

/** Why an application couldn't be sent: the API's message, or the browser's. */
export type ApplyProblem = {
  message: string;
  /** The role closed, or left the careers site, while they were applying. */
  roleGone?: boolean;
};

export function ApplyProblemAlert({ problem }: { problem: ApplyProblem }) {
  return (
    <AuthAlert>
      {problem.message}
      {problem.roleGone && (
        <>
          {" "}
          <Link href="/demo/careers" className="font-medium text-danger underline underline-offset-4 transition-colors hover:text-ink">
            See open roles
          </Link>
        </>
      )}
    </AuthAlert>
  );
}
