import { redirect } from "next/navigation";

import { roleHomePath } from "@/lib/auth";
import { requireUser } from "@/lib/session";

// Sends signed-in users to their own workspace by the role the API has on record; everyone else to /login.
export default async function Home() {
  const user = await requireUser();
  redirect(roleHomePath(user.role));
}
