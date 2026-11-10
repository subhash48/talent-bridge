import type { Metadata } from "next";

import { WorkspaceSettingsCard } from "@/components/shared/WorkspaceSettingsCard";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

// Simple Hire's settings: the business and how it hires. Its admin can switch to the full workspace here.
export default async function HireSettingsPage() {
  const user = await requireWorkspace("simple");
  return (
    <div className="max-w-2xl">
      <h1 className="text-[1.5rem] font-semibold tracking-tight text-ink sm:text-[1.75rem]">Settings</h1>
      <p className="mt-1 mb-5 text-[0.9375rem] text-stone">
        {user.name} · {user.email}
      </p>
      {user.workspace && <WorkspaceSettingsCard workspace={user.workspace} />}
    </div>
  );
}
