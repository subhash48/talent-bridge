"use client";

import { CircleAlert } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";

/** A section couldn't load. The rest of the portal keeps working, and the person can retry. */
export function LoadError({ title, message, onRetry, className }: { title: string; message?: string; onRetry: () => void; className?: string }) {
  return (
    <EmptyState
      icon={CircleAlert}
      title={title}
      description={message}
      className={className}
      action={
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}
