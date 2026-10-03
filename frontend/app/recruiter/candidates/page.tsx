import { CandidateTable } from "@/components/recruiter/CandidateTable";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { RecruiterSidebar } from "@/components/recruiter/RecruiterSidebar";

export default function CandidatesPage() {
  return (
    <div className="flex min-h-screen">
      <RecruiterSidebar />
      <main className="flex-1 px-10 py-10">
        <RecruiterHeader title="Candidates" />
        <CandidateTable rows={[]} />
      </main>
    </div>
  );
}
