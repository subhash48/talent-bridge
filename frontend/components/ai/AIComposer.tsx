"use client";

import { SendHorizontal, Square } from "lucide-react";
import { useState, type Ref } from "react";

import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";

type AIComposerProps = {
  id: string;
  label: string;
  placeholder: string;
  suggestions: string[];
  pending: boolean;
  onSend: (prompt: string) => void;
  onStop: () => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
  className?: string;
};

/** Prompt box with quick actions. Enter sends, Shift+Enter adds a line, quick actions send at once. */
export function AIComposer({ id, label, placeholder, suggestions, pending, onSend, onStop, textareaRef, className }: AIComposerProps) {
  const [value, setValue] = useState("");

  function submit() {
    const prompt = value.trim();
    if (!prompt || pending) return;
    onSend(prompt);
    setValue("");
  }

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Textarea
        id={id}
        ref={textareaRef}
        rows={2}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        aria-describedby={`${id}-hint`}
        className="field-sizing-content max-h-40 min-h-[68px] rounded-[12px] bg-black/25 px-3.5 py-3 focus-visible:border-ai/40 focus-visible:ring-ai/10"
      />
      <p id={`${id}-hint`} className="sr-only">
        Press Enter to send and Shift plus Enter for a new line.
      </p>
      <div className="mt-3 flex items-end gap-3">
        <div role="group" aria-label="Suggested prompts" className="flex flex-1 flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={pending}
              onClick={() => onSend(suggestion)}
              className="h-8 rounded-full border border-border bg-white/[0.05] px-3 text-xs text-charcoal transition-[background-color,border-color,color] duration-200 hover:border-ai/35 hover:bg-ai/10 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
        <button
          type={pending ? "button" : "submit"}
          onClick={pending ? onStop : undefined}
          disabled={!pending && !value.trim()}
          aria-label={pending ? "Stop generating" : "Send"}
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-[12px] border border-white/20 bg-canvas text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] transition-[border-color,background-color,opacity,transform] duration-200 hover:border-white/40 hover:bg-black active:scale-95 disabled:opacity-40",
            pending && "border-ai/40",
          )}
        >
          {pending ? <Square aria-hidden className="size-4 fill-current" /> : <SendHorizontal aria-hidden className="size-5" />}
        </button>
      </div>
    </form>
  );
}
