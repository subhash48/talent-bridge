import { EmptyState } from "@/components/shared/EmptyState";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { RecruiterSidebar } from "@/components/recruiter/RecruiterSidebar";

export default function JobsPage() {
  return (
    <div className="flex min-h-screen">
      <RecruiterSidebar />
      <main className="flex-1 px-10 py-10">
        <RecruiterHeader title="Jobs" />
        <EmptyState title="No open roles yet" description="Jobs you create appear here." />
      </main>
    </div>
  );
}
