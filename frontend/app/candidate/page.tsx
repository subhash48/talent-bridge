import { ApplicationProgress } from "@/components/candidate/ApplicationProgress";
import { UpcomingInterview } from "@/components/candidate/UpcomingInterview";
import { CandidateHeader } from "@/components/candidate/CandidateHeader";
import { CandidateSidebar } from "@/components/candidate/CandidateSidebar";

export default function CandidateHomePage() {
  return (
    <div className="flex min-h-screen">
      <CandidateSidebar />
      <main className="flex-1 px-10 py-10">
        <CandidateHeader title="Welcome" />
        <div className="flex flex-col gap-6">
          <ApplicationProgress />
          <UpcomingInterview interview={null} />
        </div>
      </main>
    </div>
  );
}
