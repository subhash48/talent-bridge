import { EmptyState } from "@/components/shared/EmptyState";
import { CandidateHeader } from "@/components/candidate/CandidateHeader";
import { CandidateSidebar } from "@/components/candidate/CandidateSidebar";

export default function CandidateMessagesPage() {
  return (
    <div className="flex min-h-screen">
      <CandidateSidebar />
      <main className="flex-1 px-10 py-10">
        <CandidateHeader title="Messages" />
        <EmptyState title="No messages yet" description="Messages from your recruiter appear here." />
      </main>
    </div>
  );
}
