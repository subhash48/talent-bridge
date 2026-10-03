import { EmptyState } from "@/components/shared/EmptyState";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { RecruiterSidebar } from "@/components/recruiter/RecruiterSidebar";

export default function InterviewsPage() {
  return (
    <div className="flex min-h-screen">
      <RecruiterSidebar />
      <main className="flex-1 px-10 py-10">
        <RecruiterHeader title="Interviews" />
        <EmptyState title="No interviews scheduled" description="Upcoming interviews and pending feedback appear here." />
      </main>
    </div>
  );
}
