/*
 * The photographs in "Who it's for", one per audience, keyed by its page. All three are by Vitaly Gariev on Unsplash,
 * free to use under the Unsplash License (https://unsplash.com/license): commercial use allowed, no permission or
 * credit required; not Unsplash+ images. They are stock photographs of models, not Hirvello's team or customers,
 * and the page never says otherwise. Downloaded on 2026-11-03 as 1200×800 crops into
 * public/images/who-its-for/; `source` is where each came from.
 */

export type AudiencePhoto = { src: string; alt: string; source: string; photographer: string };

export const AUDIENCE_PHOTOS: Record<string, AudiencePhoto> = {
  "/for-recruiters": {
    src: "/images/who-its-for/recruiters.jpg",
    alt: "A group of colleagues talking around a low table in a bright office",
    source: "https://unsplash.com/photos/diverse-group-of-people-in-a-modern-office-meeting-5V6KbvRcnV8",
    photographer: "Vitaly Gariev",
  },
  "/for-candidates": {
    src: "/images/who-its-for/candidates.jpg",
    alt: "A person working on a laptop at a desk, among plants in a shared office",
    source: "https://unsplash.com/photos/young-woman-working-on-a-laptop-in-an-office-272ClcPZ2Qs",
    photographer: "Vitaly Gariev",
  },
  "/for-small-businesses": {
    src: "/images/who-its-for/small-business.jpg",
    alt: "Two café workers in aprons smiling behind their counter",
    source: "https://unsplash.com/photos/two-cafe-workers-standing-behind-a-counter-uRnRa8XXtrI",
    photographer: "Vitaly Gariev",
  },
};
