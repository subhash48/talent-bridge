import { EmptyState } from "@/components/shared/EmptyState";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { RecruiterSidebar } from "@/components/recruiter/RecruiterSidebar";

export default function MessagesPage() {
  return (
    <div className="flex min-h-screen">
      <RecruiterSidebar />
      <main className="flex-1 px-10 py-10">
        <RecruiterHeader title="Messages" />
        <EmptyState title="No conversations yet" description="Candidate threads appear here." />
      </main>
    </div>
  );
}
