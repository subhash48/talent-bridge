"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type ToastInput = {
  title: string;
  description?: string;
  tone?: "success" | "error";
  action?: { label: string; onClick: () => void };
};

type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

const DURATION_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = ++nextId.current;
      setToasts((current) => [...current.slice(-2), { ...input, id }]);
      window.setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        {toasts.map((item) => {
          const Icon = item.tone === "error" ? CircleAlert : CircleCheck;
          return (
            <div
              key={item.id}
              role="status"
              className="pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-3 rounded-[12px] border border-border bg-overlay/95 p-3.5 pr-2 text-sm shadow-[0_24px_48px_-16px_rgb(0_0_0/0.85)] backdrop-blur-xl"
            >
              <Icon
                aria-hidden
                className={cn("mt-0.5 size-4 shrink-0", item.tone === "error" ? "text-danger" : "text-sage")}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{item.title}</p>
                {item.description && <p className="mt-0.5 text-stone">{item.description}</p>}
              </div>
              {item.action && (
                <button
                  type="button"
                  onClick={() => {
                    item.action?.onClick();
                    dismiss(item.id);
                  }}
                  className="rounded-[6px] px-2 py-1 text-sm font-medium text-ink transition-colors hover:bg-ink/[0.08]"
                >
                  {item.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
                className="rounded-[6px] p-1 text-stone transition-colors hover:bg-ink/[0.08] hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used inside <ToastProvider>");
  return toast;
}
