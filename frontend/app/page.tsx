import { redirect } from "next/navigation";

// TODO: send signed-in users straight to their workspace by role (ARCHITECTURE.md 10.1).
export default function Home() {
  redirect("/login");
}
