import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FilmStage, type Scene } from "@/components/site/hero/FilmStage";
import {
  CandidateScene,
  OpeningScene,
  RecruiterScene,
  SimpleHireScene,
  StatementScene,
  TwoSidesScene,
} from "@/components/site/home/scenes";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { homePath } from "@/lib/auth";
import { getSignedInUser } from "@/lib/session";

export const metadata: Metadata = { title: { absolute: "Kavuntra: hiring feels simpler" } };

// The home page, scene by scene over the film. Weights say how much of the scroll each one holds.
const SCENES: Scene[] = [
  { label: "Introduction", weight: 1.1, content: <OpeningScene /> },
  { label: "Know who needs an update", weight: 0.9, statement: true, content: <StatementScene text="Know who needs an update." /> },
  {
    label: "Help candidates know what's next",
    weight: 0.9,
    statement: true,
    content: <StatementScene text={"Help candidates know what’s next."} />,
  },
  {
    label: "A better hiring experience, on both sides",
    weight: 0.9,
    statement: true,
    content: <StatementScene text="A better hiring experience, on both sides." />,
  },
  { label: "Product", weight: 1.25, anchor: "product", content: <TwoSidesScene /> },
  { label: "For recruiters", weight: 1.35, anchor: "recruiters", content: <RecruiterScene /> },
  { label: "For candidates", weight: 1.35, anchor: "candidates", content: <CandidateScene /> },
  { label: "Simple Hire, for small businesses", weight: 1.35, anchor: "small-business", content: <SimpleHireScene /> },
];

// Signed in: straight to your workspace, by the role the API has on record. Signed out: what Kavuntra is, told
// inside the film from top to bottom. The longer pages are a click away.
export default async function Home() {
  const user = await getSignedInUser();
  if (user) redirect(homePath(user));

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      {/* Its own stacking context, so the fixed film inside sits behind every scene and nothing else. */}
      <main className="relative isolate flex-1">
        <FilmStage scenes={SCENES} />
      </main>
      <SiteFooter overFilm />
    </div>
  );
}
