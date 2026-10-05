"use client";

import { CircleAlert } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";

// Shown when a recruiter page can't load its data, e.g. the API is down or returned an error.
export default function RecruiterError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={CircleAlert}
      title="This page couldn't load"
      description="The recruiting API didn't respond as expected. Check that it's running, then try again."
      className="mt-5"
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
