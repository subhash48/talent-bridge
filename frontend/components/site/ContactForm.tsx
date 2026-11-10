"use client";

import { useState, type FormEvent } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { BUSINESS_EMAIL, CONTACT_CHANNELS } from "@/components/site/contact";
import { Button } from "@/components/ui/Button";
import { Field, fieldErrorId } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { errorMessage } from "@/services/api";
import { MAX_MESSAGE, MAX_SUBJECT, sendContactMessage, type ContactMessage } from "@/services/contact";
import { cn } from "@/lib/utils";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Contact Hirvello: what it's about (business or support, which decides the team that gets it), full name, email,
 * subject and message. Demos are booked on the Google Calendar booking page instead (components/site/nav.ts).
 */
export function ContactForm() {
  const [form, setForm] = useState<ContactMessage>({
    name: "",
    email: "",
    company: "",
    topic: "general",
    subject: "",
    message: "",
    website: "",
  });
  const [checked, setChecked] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const channel = CONTACT_CHANNELS.find((option) => option.topic === form.topic);
  const teamEmail = channel?.email ?? BUSINESS_EMAIL;
  const problems = {
    name: form.name.trim() ? undefined : "Enter your full name.",
    email: EMAIL.test(form.email.trim()) ? undefined : "Enter an email address we can reply to.",
    subject: form.subject.trim() ? undefined : "Add a subject.",
    message: form.message.trim() ? undefined : "Write your message.",
  };
  const shown: Partial<typeof problems> = checked ? problems : {};

  function update(field: keyof ContactMessage) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChecked(true);
    if (Object.values(problems).some(Boolean)) return;
    setState("sending");
    setError(null);
    try {
      await sendContactMessage(form);
      setState("sent");
    } catch (cause) {
      setError(errorMessage(cause));
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <AuthAlert tone="success">
        Thanks, {form.name.trim().split(" ")[0]}. Your message reached {channel ? `our ${channel.team}` : "Hirvello"}, and we&apos;ll
        reply to <strong className="font-medium">{form.email.trim()}</strong>.
      </AuthAlert>
    );
  }

  return (
    <form onSubmit={send} noValidate className="flex flex-col gap-4">
      {error && (
        <AuthAlert>
          {error} You can also email{" "}
          <a href={`mailto:${teamEmail}`} className="font-medium underline underline-offset-4">
            {teamEmail}
          </a>
          .
        </AuthAlert>
      )}
      <fieldset>
          <legend className="text-[13px] font-medium text-ink">What&apos;s it about?</legend>
          <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CONTACT_CHANNELS.map((option) => (
              <label
                key={option.topic}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-[12px] border px-3.5 py-3 text-[15px] font-medium transition-colors duration-200 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand/55",
                  form.topic === option.topic
                    ? "border-brand-ink bg-brand-soft text-ink"
                    : "border-border bg-surface-raised text-charcoal hover:border-border-strong",
                )}
              >
                <input
                  type="radio"
                  name="contact-topic"
                  value={option.topic}
                  checked={form.topic === option.topic}
                  onChange={update("topic")}
                  className="size-4 accent-[var(--color-brand-ink)]"
                />
                {option.title}
              </label>
            ))}
          </div>
        </fieldset>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="contact-name" error={shown.name} required>
          <Input
            id="contact-name"
            autoComplete="name"
            maxLength={100}
            value={form.name}
            onChange={update("name")}
            aria-invalid={Boolean(shown.name)}
            aria-describedby={shown.name ? fieldErrorId("contact-name") : undefined}
          />
        </Field>
        <Field label="Email" htmlFor="contact-email" error={shown.email} required>
          <Input
            id="contact-email"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={form.email}
            onChange={update("email")}
            aria-invalid={Boolean(shown.email)}
            aria-describedby={shown.email ? fieldErrorId("contact-email") : undefined}
          />
        </Field>
      </div>
      <Field label="Subject" htmlFor="contact-subject" error={shown.subject} required>
          <Input
            id="contact-subject"
            maxLength={MAX_SUBJECT}
            value={form.subject}
            onChange={update("subject")}
            aria-invalid={Boolean(shown.subject)}
            aria-describedby={shown.subject ? fieldErrorId("contact-subject") : undefined}
          />
      </Field>
      <Field label="Message" htmlFor="contact-message" error={shown.message} required>
        <Textarea
          id="contact-message"
          rows={5}
          maxLength={MAX_MESSAGE}
          value={form.message}
          onChange={update("message")}
          aria-invalid={Boolean(shown.message)}
          aria-describedby={shown.message ? fieldErrorId("contact-message") : undefined}
        />
      </Field>
      {/* Hidden from people and from screen readers: only automated form fillers fill it in. */}
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={update("website")} />
      </div>
      <div>
        <Button type="submit" size="lg" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}
