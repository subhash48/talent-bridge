"use client";

import { Building2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { MODES } from "@/components/auth/WorkspaceSetupForm";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import { updateWorkspace } from "@/services/workspace";
import type { Workspace, WorkspaceMode } from "@/types/workspace";

/**
 * The company's workspace: its name, where it is, and how it hires: the Full Recruiting Workspace or Simple
 * Hire. Admins change them; everyone else sees them. Switching changes only what the team sees: every job,
 * applicant and message stays as it is. The page opens again in the new one.
 */
export function WorkspaceSettingsCard({ workspace }: { workspace: Workspace }) {
  const [name, setName] = useState(workspace.name);
  const [location, setLocation] = useState(workspace.location ?? "");
  const [mode, setMode] = useState<WorkspaceMode>(workspace.mode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const can = workspace.canManage;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateWorkspace({ name: name.trim(), location: location.trim() || null, mode });
      if (updated.mode !== workspace.mode) {
        window.location.assign(updated.mode === "simple" ? "/hire" : "/recruiter");
        return;
      }
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-sm font-medium text-stone">
        <Building2 aria-hidden className="size-4" /> Your company
      </h2>
      <form onSubmit={(event) => void save(event)} className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="workspace-name">
            <Input id="workspace-name" value={name} disabled={!can} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Where it is" htmlFor="workspace-location">
            <Input
              id="workspace-location"
              value={location}
              disabled={!can}
              placeholder="City, State"
              onChange={(event) => setLocation(event.target.value)}
            />
          </Field>
        </div>
        <fieldset disabled={!can}>
          <legend className="text-xs font-medium text-charcoal">How your company hires</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MODES.map(({ value, title, text }) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-[12px] border p-3.5 has-[:disabled]:cursor-default has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand/55",
                  mode === value ? "border-brand-ink bg-brand-soft/60" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="workspace-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="sr-only"
                />
                <span className="text-sm font-semibold text-ink">{title}</span>
                <span className="text-xs leading-snug text-stone">{text}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-faint">
            Switching changes only what your team sees. Jobs, applicants and messages stay as they are.
          </p>
        </fieldset>
        {error && <p className="text-sm text-danger">{error}</p>}
        {saved && !error && <p className="text-sm text-sage">Saved.</p>}
        {can ? (
          <div>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-faint">Only your company&apos;s admin can change these.</p>
        )}
      </form>
    </Card>
  );
}
