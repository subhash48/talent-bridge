import { ApiError, USE_MOCK_API, apiFetch } from "@/services/api";
import type { DemoJob, DemoJobCreate, DemoJobUpdate, GeneratedJobPosting, JobPostingBrief } from "@/types/demo";

// Development only: the demo jobs a recruiter posts on the demo careers site (/demo/careers), and the
// AI job writer that drafts their postings. The API answers 404 to every demo route unless
// ENABLE_ASHBY_DEMO is on, and mock mode has no demo, so the recruiter UI hides itself in both cases.

/** GET /demo/jobs, newest first. null when the demo is off, or in mock mode. */
export async function listDemoJobs(): Promise<DemoJob[] | null> {
  if (USE_MOCK_API) return null;
  try {
    return await apiFetch<DemoJob[]>("/demo/jobs");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** null when there's no such demo job or the demo is off, including old links with ids that aren't UUIDs. */
export async function getDemoJob(id: string): Promise<DemoJob | null> {
  if (USE_MOCK_API) return null;
  try {
    return await apiFetch<DemoJob>(jobPath(id));
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) return null;
    throw error;
  }
}

/** POST /demo/jobs. It starts as a draft: publishDemoJob puts it on the careers site. */
export async function createDemoJob(input: DemoJobCreate): Promise<DemoJob> {
  return apiFetch<DemoJob>("/demo/jobs", { method: "POST", body: JSON.stringify(input) });
}

/** PATCH /demo/jobs/{id}. A published posting must stay complete, or it's a 422 (posting_incomplete). */
export async function updateDemoJob(id: string, input: DemoJobUpdate): Promise<DemoJob> {
  return apiFetch<DemoJob>(jobPath(id), { method: "PATCH", body: JSON.stringify(input) });
}

/** POST /demo/jobs/generate: an AI draft for the recruiter to review and edit. Saves nothing. */
export async function generateDemoJobPosting(brief: JobPostingBrief): Promise<GeneratedJobPosting> {
  return apiFetch<GeneratedJobPosting>("/demo/jobs/generate", { method: "POST", body: JSON.stringify(brief) });
}

/** Lists the posting on the careers site and opens the job. A 422 (posting_incomplete) names what's missing. */
export async function publishDemoJob(id: string): Promise<DemoJob> {
  return apiFetch<DemoJob>(`${jobPath(id)}/publish`, { method: "POST" });
}

/** Takes the posting off the careers site. The job stays open for the people who already applied. */
export async function unpublishDemoJob(id: string): Promise<DemoJob> {
  return apiFetch<DemoJob>(`${jobPath(id)}/unpublish`, { method: "POST" });
}

/** Closes the job: off the careers site, and no new applications. Existing applications are kept. */
export async function closeDemoJob(id: string): Promise<DemoJob> {
  return apiFetch<DemoJob>(`${jobPath(id)}/close`, { method: "POST" });
}

function jobPath(id: string): string {
  return `/demo/jobs/${encodeURIComponent(id)}`;
}
