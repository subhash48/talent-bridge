"use client";

import { Button } from "@/components/ui/Button";

/** Reloads the page, which re-runs the server-side data loading. */
export function ReloadButton({ children = "Try again" }: { children?: string }) {
  return (
    <Button variant="secondary" onClick={() => window.location.reload()}>
      {children}
    </Button>
  );
}
