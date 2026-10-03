"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Announced to screen readers; the sheet's content provides the visible heading. */
  title: string;
  side?: "left" | "right";
  className?: string;
  children: ReactNode;
};

const SIDES = {
  left: "left-0 w-[min(288px,85vw)] border-r data-[state=closed]:animate-sheet-out-left data-[state=open]:animate-sheet-in-left",
  right:
    "right-0 w-[min(480px,100vw)] border-l data-[state=closed]:animate-sheet-out-right data-[state=open]:animate-sheet-in-right",
} as const;

export function Sheet({ open, onOpenChange, title, side = "right", className, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-y-0 z-50 flex flex-col overflow-y-auto border-border bg-surface shadow-[0_0_80px_rgb(0_0_0/0.7)] focus:outline-none",
            SIDES[side],
            className,
          )}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon-sm" className="absolute top-4 right-4 z-10" aria-label="Close">
              <X />
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
