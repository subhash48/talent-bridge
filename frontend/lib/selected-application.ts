// Which of the candidate's applications the portal is showing, remembered in a cookie so server
// rendering and every page agree. It's only a preference: the API checks on every request that the
// application belongs to the signed-in candidate, and falls back to their default one otherwise.

export const APPLICATION_COOKIE = "tb_application";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isApplicationId(value: string | undefined | null): value is string {
  return Boolean(value && UUID.test(value));
}

/** Remember the selection (browser only). */
export function rememberApplication(applicationId: string): void {
  if (!isApplicationId(applicationId)) return;
  document.cookie = `${APPLICATION_COOKIE}=${applicationId}; Path=/candidate; Max-Age=${30 * 24 * 3600}; SameSite=Lax`;
}
