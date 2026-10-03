import { redirect } from "next/navigation";

// Candidates is the recruiter's home (ARCHITECTURE.md 11).
export default function RecruiterHomePage() {
  redirect("/recruiter/candidates");
}
