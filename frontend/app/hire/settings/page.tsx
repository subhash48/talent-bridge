import type { Metadata } from "next";

import { WorkspaceSettingsCard } from "@/components/shared/WorkspaceSettingsCard";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

// Simple Hire's settings: the business and how it hires. Its admin can switch to the full workspace here.
export default async function HireSettingsPage() {
  const user = await requireWorkspace("simple");
  return (
    <div className="max-w-2xl">
      <h1 className="text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]">Settings</h1>
      <p className="mt-1 mb-5 text-[15px] text-stone">
        {user.name} · {user.email}
      </p>
      {user.workspace && <WorkspaceSettingsCard workspace={user.workspace} />}
    </div>
  );
}
