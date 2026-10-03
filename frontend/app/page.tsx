import { redirect } from "next/navigation";

// TODO: send signed-in users to their workspace by role (ARCHITECTURE.md 10.1). Until auth lands,
// the app opens on the recruiter dashboard; /login still offers both previews.
export default function Home() {
  redirect("/recruiter/candidates");
}
