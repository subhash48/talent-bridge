import { ArrowRight, History } from "lucide-react";
import Link from "next/link";

import { ActivityList } from "@/components/candidate/ActivityList";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { CandidateActivity } from "@/types/portal";

/** The newest entry on the application's timeline; the rest is on the application page. */
export function LatestUpdateCard({ latest, applicationId }: { latest: CandidateActivity | null; applicationId: string }) {
  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-[13px] font-medium text-stone">
        <History aria-hidden className="size-4" /> Latest update
      </h2>
      {latest ? (
        <ActivityList items={[latest]} className="mt-4" />
      ) : (
        <p className="mt-3 text-sm text-stone">Nothing yet. Updates to your application will appear here.</p>
      )}
      <div className="mt-auto pt-6">
        <Link href={`/candidate/application/${applicationId}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          Full timeline <ArrowRight />
        </Link>
      </div>
    </Card>
  );
}
