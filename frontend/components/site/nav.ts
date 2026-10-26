/** The public website's sections, in page order: the header's and the footer's links. */
export const SITE_SECTIONS = [
  { id: "product", label: "Product" },
  { id: "recruiters", label: "For Recruiters" },
  { id: "small-business", label: "For Small Businesses" },
  { id: "candidates", label: "For Candidates" },
  { id: "about", label: "About" },
  { id: "contact", label: "Contact" },
] as const;

export type SiteSectionId = (typeof SITE_SECTIONS)[number]["id"];

/** A link to a section of the home page, from any page of the site. */
export function sectionHref(id: SiteSectionId): string {
  return `/#${id}`;
}
