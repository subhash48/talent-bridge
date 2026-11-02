/*
 * Where to follow Hirvello. The profile addresses aren't written into the code: they come from HIRVELLO_LINKEDIN_URL
 * and HIRVELLO_INSTAGRAM_URL in the environment the site is built and run in (see frontend/.env.example), so
 * nothing here can point at the wrong page. One that isn't set still shows in the footer by name, with its icon,
 * but isn't a link.
 */

export type SocialNetwork = "LinkedIn" | "Instagram";

export type SocialLink = { network: SocialNetwork; href: string | null };

/** A configured address, if it's one (https, nothing else), or null. */
function address(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && /^https:\/\/[^\s]+$/.test(trimmed) ? trimmed : null;
}

export function socialLinks(): SocialLink[] {
  return [
    { network: "LinkedIn", href: address(process.env.HIRVELLO_LINKEDIN_URL) },
    { network: "Instagram", href: address(process.env.HIRVELLO_INSTAGRAM_URL) },
  ];
}
