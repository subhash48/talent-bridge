import { InterviewPrep } from "@/components/candidate/InterviewPrep";
import { CandidateHeader } from "@/components/candidate/CandidateHeader";
import { CandidateSidebar } from "@/components/candidate/CandidateSidebar";

export default function ResourcesPage() {
  return (
    <div className="flex min-h-screen">
      <CandidateSidebar />
      <main className="flex-1 px-10 py-10">
        <CandidateHeader title="Resources" />
        <InterviewPrep resources={[]} />
      </main>
    </div>
  );
}
