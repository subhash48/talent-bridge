"use client";

import { CircleAlert } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";

// Shown inside Simple Hire, with its navigation, when a page can't load its data (the API is down or failed).
export default function HireError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={CircleAlert}
      title="This page couldn't load"
      description="TalentBridge didn't respond just now. Nothing you did was lost. Try again in a moment."
      className="mt-5"
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
