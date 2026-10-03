import { InterviewPrep } from "@/components/candidate/InterviewPrep";
import { UpcomingInterview } from "@/components/candidate/UpcomingInterview";
import { CandidateHeader } from "@/components/candidate/CandidateHeader";
import { CandidateSidebar } from "@/components/candidate/CandidateSidebar";

export default function CandidateInterviewsPage() {
  return (
    <div className="flex min-h-screen">
      <CandidateSidebar />
      <main className="flex-1 px-10 py-10">
        <CandidateHeader title="Interviews" />
        <div className="flex flex-col gap-6">
          <UpcomingInterview interview={null} />
          <InterviewPrep resources={[]} />
        </div>
      </main>
    </div>
  );
}
