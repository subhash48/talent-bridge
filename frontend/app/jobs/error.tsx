"use client";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";

export default function JobsError({ reset }: { reset: () => void }) {
  return <div className="mx-auto max-w-3xl px-5 py-12"><EmptyState title="Jobs can't load right now"
    description="We couldn't reach Hirvello. Please try again." action={<Button onClick={reset}>Retry</Button>} /></div>;
}
