import { CandidateDetail } from "@/components/recruiter/CandidateDetail";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { RecruiterSidebar } from "@/components/recruiter/RecruiterSidebar";

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex min-h-screen">
      <RecruiterSidebar />
      <main className="flex-1 px-10 py-10">
        <RecruiterHeader title="Candidate" />
        <CandidateDetail candidateId={id} />
      </main>
    </div>
  );
}
