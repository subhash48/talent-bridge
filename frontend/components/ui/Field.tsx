import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

/** Label + control + error. Give the control aria-describedby={fieldErrorId(htmlFor)} when invalid. */
export function Field({ label, htmlFor, error, required, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-charcoal">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-faint">
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <p id={fieldErrorId(htmlFor)} className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

export function fieldErrorId(htmlFor: string) {
  return `${htmlFor}-error`;
}
