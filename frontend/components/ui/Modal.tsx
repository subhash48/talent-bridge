"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

// Radix Dialog: focus trap, Escape, scroll lock and focus return to the trigger.
export function Modal({ open, onClose, title, description, children, className }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content
          // Without a description, opt out explicitly so Radix doesn't point at a missing element.
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[14px] border border-border bg-overlay p-5 shadow-[0_40px_80px_-20px_rgb(0_0_0/0.8)] focus:outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
            className,
          )}
        >
          <Dialog.Title className="pr-10 text-base font-semibold tracking-tight text-ink">{title}</Dialog.Title>
          {description && <Dialog.Description className="mt-1 text-[13px] text-stone">{description}</Dialog.Description>}
          <div className="mt-5">{children}</div>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon-sm" className="absolute top-4 right-4" aria-label="Close">
              <X />
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
