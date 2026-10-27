/** The public website's places: the header's links, in order. Product is the home page's first section. */
export const SITE_LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/for-recruiters", label: "Recruiters" },
  { href: "/for-small-businesses", label: "Small Businesses" },
  { href: "/for-candidates", label: "Candidates" },
  { href: "/about", label: "About" },
] as const;

/** The footer's links: the same places, then the ones only the footer needs. */
export const FOOTER_LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/for-recruiters", label: "Recruiters" },
  { href: "/for-candidates", label: "Candidates" },
  { href: "/for-small-businesses", label: "Small Businesses" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;
