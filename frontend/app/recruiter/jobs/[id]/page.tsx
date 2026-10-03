import { EmptyState } from "@/components/shared/EmptyState";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { RecruiterSidebar } from "@/components/recruiter/RecruiterSidebar";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex min-h-screen">
      <RecruiterSidebar />
      <main className="flex-1 px-10 py-10">
        <RecruiterHeader title="Job" />
        <EmptyState title="Job details" description={`Applicants for job ${id} will be grouped by stage here.`} />
      </main>
    </div>
  );
}
