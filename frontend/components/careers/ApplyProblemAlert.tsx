import Link from "next/link";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { CAREERS_PATHS, type CareersSite } from "@/types/careers";

/** Why an application couldn't be sent: the API's message, or the browser's. */
export type ApplyProblem = {
  message: string;
  /** The role closed, or left the board, while they were applying. */
  roleGone?: boolean;
};

/** The alert above the button; a role that went links back to the site's open roles. */
export function ApplyProblemAlert({ problem, site = "demo" }: { problem: ApplyProblem; site?: CareersSite }) {
  return (
    <AuthAlert>
      {problem.message}
      {problem.roleGone && (
        <>
          {" "}
          <Link href={CAREERS_PATHS[site]} className="font-medium text-danger underline underline-offset-4 transition-colors hover:text-ink">
            See open roles
          </Link>
        </>
      )}
    </AuthAlert>
  );
}
