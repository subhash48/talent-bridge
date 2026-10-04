"use client";

import { FileText, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";

import { Button, buttonStyles } from "@/components/ui/Button";
import { fieldErrorId } from "@/components/ui/Field";
import { cn } from "@/lib/utils";
import { MAX_RESUME_BYTES, type ResumeUpload } from "@/types/careers";

// The API decides a résumé's type from its content; checking the name and size here only saves a
// round trip for the obvious mistakes.
const RESUME_NAME = /\.(pdf|docx?)$/i;
const FORMATS = "PDF, DOC or DOCX, up to 5 MB";

/** Why a file can't be sent as a résumé, or undefined if it can. */
export function resumeProblem(file: File): string | undefined {
  if (!RESUME_NAME.test(file.name)) return "Choose a PDF, DOC or DOCX file.";
  if (file.size === 0) return "That file is empty. Choose another one.";
  if (file.size > MAX_RESUME_BYTES) return "Choose a file of 5 MB or less.";
  return undefined;
}

/** The file as the API takes it: base64, read as a data: URL with its prefix cut off. */
export function readResume(file: File): Promise<ResumeUpload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve({ fileName: file.name, contentType: file.type, data: url.slice(url.indexOf(",") + 1) });
    };
    reader.onerror = () => reject(reader.error ?? new Error("The file couldn't be read."));
    reader.readAsDataURL(file);
  });
}

type ResumeInputProps = {
  id: string;
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  disabled?: boolean;
};

/**
 * A file input that also takes a dropped file. The native input stays the control (visually hidden,
 * still focusable), so the keyboard, screen readers and the label work as usual.
 */
export function ResumeInput({ id, file, onChange, error, disabled }: ResumeInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const hintId = `${id}-hint`;

  // A dropped file, or one kept while the form was off screen, isn't in the native input: put it
  // there, so assistive tech announces the file that will be sent.
  useEffect(() => {
    const element = input.current;
    if (!element || (element.files?.[0] ?? null) === file) return;
    try {
      const transfer = new DataTransfer();
      if (file) transfer.items.add(file);
      element.files = transfer.files;
    } catch {
      // Browsers without a DataTransfer constructor: the file shown here is still the one sent.
    }
  }, [file]);

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped && !disabled) onChange(dropped);
  }

  function remove() {
    onChange(null);
    input.current?.focus();
  }

  const chooseStyles = cn("cursor-pointer", disabled && "pointer-events-none opacity-50");

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={drop}
      className={cn(
        "rounded-[12px] border border-dashed border-border-strong bg-white/[0.02] transition-[border-color,background-color,box-shadow] duration-150 has-[input:focus-visible]:border-white/30 has-[input:focus-visible]:ring-4 has-[input:focus-visible]:ring-white/[0.06]",
        file && "border-solid border-border",
        error && "border-danger/60",
        dragging && "border-ai/60 bg-ai/[0.06]",
      )}
    >
      <input
        ref={input}
        id={id}
        type="file"
        accept=".pdf,.doc,.docx"
        required
        disabled={disabled}
        aria-label="Résumé"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${hintId} ${fieldErrorId(id)}` : hintId}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        className="sr-only"
      />
      {file ? (
        <div className="flex items-center gap-3 p-3 sm:p-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.05] ring-1 ring-white/[0.08]">
            <FileText aria-hidden className="size-[18px] text-charcoal" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{file.name}</p>
            <p id={hintId} className="text-xs text-stone">
              {formatFileSize(file.size)} · {FORMATS}
            </p>
          </div>
          <label htmlFor={id} className={buttonStyles({ variant: "secondary", size: "sm", className: chooseStyles })}>
            Replace
          </label>
          <Button variant="ghost" size="icon-sm" onClick={remove} disabled={disabled} aria-label="Remove résumé">
            <X />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 py-7 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-white/[0.05] ring-1 ring-white/[0.08]">
            <Upload aria-hidden className="size-[18px] text-charcoal" />
          </span>
          <p className="text-sm text-charcoal">
            <label htmlFor={id} className={cn("font-medium text-ink underline-offset-4 hover:underline", chooseStyles)}>
              Choose a file
            </label>
            <span className="hidden sm:inline"> or drag it here</span>
          </p>
          <p id={hintId} className="text-xs text-stone">
            {FORMATS}
          </p>
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
