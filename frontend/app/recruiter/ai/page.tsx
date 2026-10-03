import { RecruiterAI } from "@/components/recruiter/RecruiterAI";
import { RecruiterHeader } from "@/components/recruiter/RecruiterHeader";
import { RecruiterSidebar } from "@/components/recruiter/RecruiterSidebar";

export default function RecruiterAIPage() {
  return (
    <div className="flex min-h-screen">
      <RecruiterSidebar />
      <main className="flex-1 px-10 py-10">
        <RecruiterHeader title="AI Assistant" />
        <RecruiterAI />
      </main>
    </div>
  );
}
