import { PowerOff, SearchX, ServerCrash } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/EmptyState";
import { ReloadButton } from "@/components/shared/ReloadButton";
import { buttonStyles } from "@/components/ui/Button";

// The careers site's calm states, in place of a list or a role.

/** The API answers 404 to every demo route until the backend runs with ENABLE_ASHBY_DEMO=true. */
export function CareersOff() {
  return (
    <EmptyState
      icon={PowerOff}
      title="The demo careers site is turned off."
      description="It's a development demo: it opens when the backend runs with ENABLE_ASHBY_DEMO=true, and never in production."
    />
  );
}

/** The API couldn't be reached, or failed. Reloading asks again. */
export function CareersUnavailable({ message }: { message: string }) {
  return <EmptyState icon={ServerCrash} title="The careers site can't load right now" description={message} action={<ReloadButton />} />;
}

/** A role that isn't on the careers site: never published, unpublished, closed, or an old link. */
export function RoleNotOpen() {
  return (
    <EmptyState
      icon={SearchX}
      title="This role isn't open"
      description="It may have closed, or the link may be out of date."
      action={
        <Link href="/demo/careers" className={buttonStyles({ variant: "secondary" })}>
          See open roles
        </Link>
      }
    />
  );
}
