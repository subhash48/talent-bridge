"use client";

import { useState, type FormEvent } from "react";

import { AuthAlert } from "@/components/auth/AuthAlert";
import { Button } from "@/components/ui/Button";
import { Field, fieldErrorId } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { errorMessage } from "@/services/api";
import { CONTACT_TOPICS, sendContactMessage, type ContactMessage } from "@/services/contact";

const EMPTY: ContactMessage = { name: "", email: "", company: "", topic: "general", message: "", website: "" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Contact Kavuntra: full name, email, company (optional), the type of inquiry and the message. */
export function ContactForm() {
  const [form, setForm] = useState<ContactMessage>(EMPTY);
  const [checked, setChecked] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const problems = {
    name: form.name.trim() ? undefined : "Enter your full name.",
    email: EMAIL.test(form.email.trim()) ? undefined : "Enter an email address we can reply to.",
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
        Thanks, {form.name.trim().split(" ")[0]}. Your message reached Kavuntra, and we&apos;ll reply to{" "}
        <strong className="font-medium">{form.email.trim()}</strong>.
      </AuthAlert>
    );
  }

  return (
    <form onSubmit={send} noValidate className="flex flex-col gap-4">
      {error && <AuthAlert>{error}</AuthAlert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="contact-name" error={shown.name} required>
          <Input
            id="contact-name"
            autoComplete="name"
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
            value={form.email}
            onChange={update("email")}
            aria-invalid={Boolean(shown.email)}
            aria-describedby={shown.email ? fieldErrorId("contact-email") : undefined}
          />
        </Field>
        <Field label="Company (optional)" htmlFor="contact-company">
          <Input id="contact-company" autoComplete="organization" value={form.company} onChange={update("company")} />
        </Field>
        <Field label="Inquiry type" htmlFor="contact-topic">
          <Select id="contact-topic" value={form.topic} onChange={update("topic")}>
            {CONTACT_TOPICS.map((topic) => (
              <option key={topic.value} value={topic.value}>
                {topic.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Message" htmlFor="contact-message" error={shown.message} required>
        <Textarea
          id="contact-message"
          rows={5}
          maxLength={5000}
          value={form.message}
          onChange={update("message")}
          aria-invalid={Boolean(shown.message)}
          aria-describedby={shown.message ? fieldErrorId("contact-message") : undefined}
        />
      </Field>
      {/* Hidden from people and from screen readers: only automated form fillers fill it in. */}
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={update("website")}
        />
      </div>
      <div>
        <Button type="submit" size="lg" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}
