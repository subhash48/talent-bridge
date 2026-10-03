"use client";

import { useEffect, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
};

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("w-full max-w-lg rounded-[20px] bg-surface-raised p-6 shadow-raised", className)}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
