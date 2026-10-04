import "server-only";

import { cookies } from "next/headers";

import { APPLICATION_COOKIE, isApplicationId } from "@/lib/selected-application";

/** The application the candidate last selected, for rendering portal pages on the server. */
export async function selectedApplicationId(): Promise<string | undefined> {
  const value = (await cookies()).get(APPLICATION_COOKIE)?.value;
  return isApplicationId(value) ? value : undefined;
}
