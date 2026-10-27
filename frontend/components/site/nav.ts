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

/*
 * The places as the compact header will show them: Product (its own page), then the company. Careers here is
 * working at Kavuntra: /careers itself is the job board, the open roles of the companies hiring with Kavuntra,
 * which keeps its route.
 */

export const PRODUCT_LINK = { href: "/product", label: "Product" } as const;

export const COMPANY_LINKS = [
  { href: "/about", label: "About" },
  { href: "/about/careers", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

export const POLICY_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;
