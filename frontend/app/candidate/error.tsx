"use client";

import { CircleAlert } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";

// Shown when a portal page can't render, e.g. the API returned something unexpected.
export default function CandidateError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={CircleAlert}
      title="This page couldn't load"
      description="Something went wrong while loading your information. Please try again in a moment."
      className="mt-5"
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
