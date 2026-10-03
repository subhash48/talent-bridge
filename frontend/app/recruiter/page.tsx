import { CandidateTable } from "@/components/recruiter/CandidateTable";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { RecruiterSidebar } from "@/components/recruiter/RecruiterSidebar";

export default function RecruiterDashboardPage() {
  return (
    <div className="flex min-h-screen">
      <RecruiterSidebar />
      <main className="flex-1 px-10 py-10">
        <RecruiterHeader title="Dashboard" />
        <CandidateTable rows={[]} />
      </main>
    </div>
  );
}
