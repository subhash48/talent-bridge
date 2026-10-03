import { CandidateAI } from "@/components/candidate/CandidateAI";
import { CandidateHeader } from "@/components/candidate/CandidateHeader";
import { CandidateSidebar } from "@/components/candidate/CandidateSidebar";

export default function CandidateAIPage() {
  return (
    <div className="flex min-h-screen">
      <CandidateSidebar />
      <main className="flex-1 px-10 py-10">
        <CandidateHeader title="AI Assistant" />
        <CandidateAI />
      </main>
    </div>
  );
}
