import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { buttonStyles } from "@/components/ui/Button";

export default function JobNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <EmptyState icon={SearchX} title="This role isn't open anymore" description="It may have closed, or the link may be out of date."
        action={<Link href="/jobs" className={buttonStyles({ size: "lg" })}>Browse jobs</Link>} />
    </div>
  );
}
