import { apiFetch } from "@/services/api";
import type { ApiWorkspace } from "@/types/api";
import type { Workspace, WorkspaceMode } from "@/types/workspace";

// The signed-in recruiter's workspace (backend /workspace): the company, where it is and how it hires.

export type WorkspaceChanges = { name?: string; location?: string | null; mode?: WorkspaceMode };

/** PATCH /workspace, admins only (403 admins_only otherwise). Only what's given changes. */
export async function updateWorkspace(changes: WorkspaceChanges): Promise<Workspace> {
  const workspace = await apiFetch<ApiWorkspace>("/workspace", { method: "PATCH", body: JSON.stringify(changes) });
  return {
    id: workspace.id,
    name: workspace.name,
    mode: workspace.mode,
    location: workspace.location,
    canManage: workspace.can_manage,
  };
}
