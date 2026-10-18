import { redirect } from "next/navigation";

// Today (who needs an update) is the recruiter's home.
export default function RecruiterHomePage() {
  redirect("/recruiter/today");
}
