import { ArrowRight, Check, Inbox, Mic, NotebookPen, Sparkles, Video } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { KavuntraMark } from "@/components/shared/KavuntraLogo";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/*
 * The home page's scenes, shown one at a time over the film (components/site/hero/FilmStage.tsx). Each puts its
 * words in the sky and, when it has one, a small picture of the product over the meadow. Nothing here hides
 * the film: no panels, only frosted cards the size of what they show.
 */

/*
 * While the film plays, every scene has to fit one screen, so short screens drop the pictures' extra rows (wide
 * screens put the picture beside the words and have room; phones stack them). Rows of the pictures, which screen
 * readers skip anyway, are hidden outright; lines of text are only hidden from view, so screen readers still read
 * them. The still layout (reduced motion, data saver) shows everything: there a scene can be as tall as it needs.
 * Tailwind needs whole class names, so each combination is spelled out.
 */
const STILL_FLEX = "motion-reduce:flex! group-data-[still]/stage:flex!";
const ROW_SHORT = `[@media(max-height:760px)]:hidden [@media(max-height:820px)_and_(max-width:1023px)]:hidden ${STILL_FLEX}`;
const ROW_SHORT_PHONE = `[@media(max-height:820px)_and_(max-width:1023px)]:hidden ${STILL_FLEX}`;
const ROW_UNDER_960 = `[@media(max-height:960px)]:hidden ${STILL_FLEX}`;
const BUTTON_TINY_PHONE =
  "[@media(max-height:700px)_and_(max-width:1023px)]:hidden motion-reduce:inline-flex! group-data-[still]/stage:inline-flex!";
const STILL_SHOWN = "motion-reduce:not-sr-only! group-data-[still]/stage:not-sr-only!";
const TEXT_SHORT = `[@media(max-height:760px)]:sr-only [@media(max-height:820px)_and_(max-width:1023px)]:sr-only ${STILL_SHOWN}`;
const TEXT_TINY_PHONE = `[@media(max-height:700px)_and_(max-width:1023px)]:sr-only ${STILL_SHOWN}`;

function Frame({
  children,
  visual,
  align = "left",
  visualAlign = "end",
}: {
  children: ReactNode;
  visual?: ReactNode;
  align?: "left" | "center";
  visualAlign?: "start" | "end" | "center";
}) {
  // Left-aligned scenes on wide screens: words at the top of one column, the picture at the foot of the other. The
  // scenes put their words on the right, where the sky and the sunlit haze are light; the crags are on the left.
  const beside = align === "left" && visual;
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-5 pt-[clamp(84px,13svh,176px)] pb-[clamp(20px,5svh,64px)] sm:px-8",
        beside && "lg:items-end lg:gap-14",
        beside && (visualAlign === "start" ? "lg:flex-row-reverse" : "lg:flex-row"),
      )}
    >
      <div
        className={cn(
          "scene-fade",
          align === "center" ? "mx-auto max-w-[56rem] text-center" : "max-w-[40rem]",
          beside && "lg:max-w-[34rem] lg:shrink-0 lg:self-start",
        )}
      >
        {children}
      </div>
      {visual && (
        <div
          className={cn(
            "mt-auto flex pt-6",
            visualAlign === "end" && "justify-end",
            visualAlign === "center" && "justify-center",
            beside && "lg:mt-0 lg:flex-1 lg:pt-0",
            beside && (visualAlign === "start" ? "lg:justify-start" : "lg:justify-end"),
          )}
        >
          {visual}
        </div>
      )}
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[12px] font-semibold tracking-[0.2em] text-brand-ink/85 uppercase">{children}</p>;
}

function Headline({ id, children, size = "md" }: { id?: string; children: ReactNode; size?: "md" | "lg" }) {
  return (
    <h2
      id={id}
      className={cn(
        "mt-4 font-medium tracking-[-0.02em] text-[#10282b]",
        // The size before the leading: a later font size would drop the leading (tailwind-merge).
        size === "lg" ? "text-[clamp(30px,3.3vw,52px)]" : "text-[clamp(28px,2.9vw,44px)]",
        "leading-[1.08]",
      )}
    >
      {children}
    </h2>
  );
}

function Copy({ children }: { children: ReactNode }) {
  return <p className={cn("mt-5 text-[16px] leading-relaxed font-medium text-ink sm:text-[18px]", TEXT_TINY_PHONE)}>{children}</p>;
}

function Onward({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonStyles({ variant: "glass", size: "xl", className: "group mt-7 shadow-soft" })}>
      {children}
      <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

/*
 * The film's headlines (the opening line and the statements between scenes): an editorial serif in forest teal,
 * sized for the screen, and centred in the viewport. The scene is the whole viewport (FilmStage), so a flex column
 * centres the words in what's left under the floating header, lifted a little above the exact middle, where the
 * eye reads the centre to be and the valley's haze is lightest. No margins to balance by hand, and no wash behind
 * the words: only the faintest pale halo on the letters themselves, for where a tree or a crag is behind them.
 */
const HALO = "[text-shadow:0_1px_1px_rgb(246_243_236/0.3),0_0_30px_rgb(246_243_236/0.5)]";
const HEADLINE = `font-serif text-[clamp(40px,calc(28px+2.6vw),76px)] leading-[1.04] tracking-[-0.01em] text-balance text-[#10282b] ${HALO}`;

function Centre({ children }: { children: ReactNode }) {
  return (
    <div className="scene-fade mx-auto flex w-full max-w-[1100px] flex-1 flex-col items-center justify-center px-5 pt-[60px] pb-[20svh] text-center sm:px-8 lg:pt-[76px]">
      {children}
    </div>
  );
}

/** The opening: one line, what Kavuntra does, and the two ways in, with the valley left clear around them. */
export function OpeningScene() {
  return (
    <Centre>
      <h1 className={cn(HEADLINE, "max-w-[24ch]")}>Hiring feels simpler.</h1>
      <p className={cn("mt-4 text-[clamp(16px,1.2vw,19px)] leading-relaxed font-medium text-balance text-[#1f3539]", HALO)}>
        Kavuntra keeps recruiters responsive and candidates informed.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
        <Link href="/start" className={buttonStyles({ size: "xl", className: "group h-11 px-5 text-[14px] sm:px-6.5 sm:text-[15px]" })}>
          Get started
          <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="#product"
          className={buttonStyles({ variant: "glass", size: "xl", className: "h-11 px-5 text-[14px] text-[#10282b] sm:px-6.5 sm:text-[15px]" })}
        >
          See how it works
        </Link>
      </div>
    </Centre>
  );
}

/** One line between scenes, as the valley goes by: the same type and the same centre as the opening. */
export function StatementScene({ text }: { text: string }) {
  return (
    <Centre>
      <p className={cn(HEADLINE, "max-w-[24ch]")}>{text}</p>
    </Centre>
  );
}

const SIDES = [
  {
    who: "Recruiters",
    title: "Know who needs attention.",
    text: "Kavuntra notices when a candidate has waited too long for an update, and brings them to the top of your day.",
    signal: "3 candidates are waiting on you",
    dot: "bg-highlight",
  },
  {
    who: "Candidates",
    title: "Know what happens next.",
    text: "Every applicant sees where they stand, what comes next and how to prepare, without having to ask.",
    signal: "Next step: interview on Thursday",
    dot: "bg-sage",
  },
];

/** The idea: the same hiring process, seen clearly from both sides. */
export function TwoSidesScene() {
  return (
    <Frame
      align="center"
      visualAlign="center"
      visual={
        <div className="grid w-full max-w-[920px] grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {SIDES.map((side) => (
            <div key={side.who} className="scene-card rounded-[24px] p-5 sm:p-7">
              <p className="text-[13px] font-medium text-stone">{side.who}</p>
              <h3 className="mt-1.5 text-[22px] leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-[26px]">
                {side.title}
              </h3>
              <p className={cn("mt-2.5 text-[15px] leading-relaxed text-charcoal", TEXT_SHORT)}>{side.text}</p>
              <p className="mt-4 inline-flex items-center gap-2.5 rounded-full bg-overlay/80 px-3.5 py-1.5 text-[13px] font-medium text-charcoal ring-1 ring-ink/[0.06]">
                <span aria-hidden className={`size-2 rounded-full ${side.dot}`} />
                {side.signal}
              </p>
            </div>
          ))}
        </div>
      }
    >
      <Eyebrow>Product</Eyebrow>
      <Headline id="product-title" size="lg">
        One hiring experience. Two sides.
      </Headline>
    </Frame>
  );
}

// Made-up people, for the picture of the workspace.
const WAITING = [
  { name: "Maya Okafor", role: "Senior Product Designer", gap: "No update in 6 days", initials: "MO", selected: true },
  { name: "Daniel Reyes", role: "Data Engineer", gap: "Asked about next steps", initials: "DR" },
  { name: "Priya Shah", role: "Account Executive", gap: "Interview moved, not yet told", initials: "PS" },
];

/** For recruiters: Today, where the gaps show and the next update is drafted for review. */
export function RecruiterScene() {
  return (
    <Frame
      visualAlign="start"
      visual={
        <figure
          aria-label="The recruiter workspace's Today page, with candidates waiting for an update and a drafted reply"
          className="scene-card w-full max-w-[640px] rounded-[24px] p-4 sm:p-6"
        >
          <div aria-hidden>
            <div className="flex items-center gap-2.5">
              <Inbox className="size-4 text-brand-ink" strokeWidth={1.75} />
              <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Needs an update</p>
              <span className="ml-auto rounded-full bg-highlight px-2 text-[11px] leading-5 font-semibold text-on-highlight">3</span>
            </div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {WAITING.map((person, index) => (
                <li
                  key={person.name}
                  className={cn(
                    "flex items-center gap-3 rounded-[14px] px-2.5 py-2",
                    person.selected && "bg-overlay/90 ring-1 ring-ink/[0.06]",
                    index === 1 && ROW_SHORT_PHONE,
                    index === 2 && ROW_UNDER_960,
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-brand-ink">
                    {person.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{person.name}</span>
                    <span className="block truncate text-xs text-stone">{person.role}</span>
                  </span>
                  <span className="hidden items-center gap-1.5 text-xs text-caution sm:flex">
                    <span className="size-1.5 rounded-full bg-highlight" />
                    {person.gap}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-[16px] bg-overlay/90 p-3.5 ring-1 ring-ink/[0.06]">
              <p className="flex items-center gap-1.5 text-xs font-medium text-brand-ink">
                <Sparkles className="size-3.5" /> Drafted for you to review
              </p>
              <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-charcoal">
                Hi Maya, thank you for your patience. The team finished your interviews this week and you&apos;ll have a
                decision from us by Friday.
              </p>
              <div className={cn("mt-2.5 flex items-center justify-between gap-3", ROW_SHORT_PHONE)}>
                <span className="text-[11px] text-stone">Nothing is sent until you approve it</span>
                <span className="flex h-8 items-center rounded-[10px] bg-brand px-3 text-xs font-medium text-on-brand">Send update</span>
              </div>
            </div>
          </div>
        </figure>
      }
    >
      <Eyebrow>For recruiters</Eyebrow>
      <Headline id="recruiters-title">Never lose track of a candidate conversation.</Headline>
      <Copy>
        Kavuntra detects communication gaps and helps recruiters draft the next update while keeping humans in control.
      </Copy>
      <Onward href="/for-recruiters">Explore for recruiters</Onward>
    </Frame>
  );
}

const STAGES = [
  { label: "Applied", state: "done" },
  { label: "Screening", state: "done" },
  { label: "Interview", state: "current" },
  { label: "Offer", state: "ahead" },
] as const;

/** For candidates: one application, where it stands and what comes next. */
export function CandidateScene() {
  return (
    <Frame
      visualAlign="start"
      visual={
        <figure
          aria-label="An application in the candidate portal: interview stage, with interview preparation as the next step"
          className="scene-card w-full max-w-[520px] rounded-[24px] p-5 sm:p-6"
        >
          <div aria-hidden>
            <p className="text-xs font-medium text-stone">Your application · Fernhill Studio</p>
            <p className="mt-1 text-lg font-semibold tracking-[-0.02em] text-ink">Product Designer</p>
            <ol className="mt-5 grid grid-cols-4">
              {STAGES.map((stage, index) => (
                <li key={stage.label} className="relative flex flex-col items-start">
                  {index > 0 && (
                    <span
                      className={cn(
                        "absolute top-[12px] right-[calc(100%-2px)] h-px w-[calc(100%-28px)]",
                        stage.state === "ahead" ? "bg-border-strong" : "bg-brand",
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      "flex size-[25px] items-center justify-center rounded-full",
                      stage.state === "done" && "bg-brand text-on-brand",
                      stage.state === "current" && "bg-overlay ring-2 ring-brand",
                      stage.state === "ahead" && "bg-overlay ring-1 ring-border-strong",
                    )}
                  >
                    {stage.state === "done" && <Check className="size-3.5" strokeWidth={2.5} />}
                    {stage.state === "current" && <span className="size-2 rounded-full bg-brand" />}
                  </span>
                  <span className={cn("mt-2 text-xs", stage.state === "current" ? "font-semibold text-ink" : "text-stone")}>
                    {stage.label}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-[16px] bg-overlay/90 p-4 ring-1 ring-ink/[0.06]">
              <p className="text-[11px] font-medium tracking-[0.12em] text-brand-ink/80 uppercase">Next step</p>
              <p className="mt-1 text-[16px] font-semibold tracking-[-0.01em] text-ink">Interview preparation</p>
              <p className={cn("mt-1 flex items-center gap-2 text-[13px] text-charcoal", ROW_SHORT)}>
                <Video className="size-4 shrink-0" strokeWidth={1.75} /> Thursday, 10:00 · Video call with the design team
              </p>
              <span className={cn("mt-3 inline-flex h-9 items-center gap-2 rounded-[10px] bg-brand px-3.5 text-xs font-medium text-on-brand", BUTTON_TINY_PHONE)}>
                <NotebookPen className="size-3.5" strokeWidth={1.75} /> Start preparing
              </span>
            </div>
          </div>
        </figure>
      }
    >
      <Eyebrow>For candidates</Eyebrow>
      <Headline id="candidates-title">No more wondering what happens next.</Headline>
      <Copy>
        One place for every application: where it stands, what comes next, the interview and how to prepare for it.
      </Copy>
      <Onward href="/for-candidates">For candidates</Onward>
    </Frame>
  );
}

const FACTS = ["$17/hour", "Saturday + Sunday", "2 openings"];

/** Simple Hire, for small businesses: say who you need, and the job is ready. */
export function SimpleHireScene() {
  return (
    <Frame
      visualAlign="start"
      visual={
        <figure aria-label="Simple Hire: asking for two weekend cashiers, and the job ready to post" className="w-full max-w-[460px]">
          <div aria-hidden className="flex flex-col gap-3">
            <div className="scene-fade flex items-end justify-end gap-2.5">
              <p className="max-w-[19rem] rounded-[22px] rounded-br-[6px] bg-brand px-4 py-3 text-[15px] leading-relaxed text-on-brand shadow-raised">
                I need two weekend cashiers at $17 an hour.
              </p>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand shadow-soft">
                <Mic className="size-4" />
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="scene-card flex size-9 shrink-0 items-center justify-center rounded-full">
                <KavuntraMark className="h-4" />
              </span>
              <div className="scene-card flex-1 rounded-[22px] rounded-tl-[6px] p-4">
                <p className="flex items-center gap-2 text-[15px] font-medium text-ink">
                  <Check className="size-4 text-sage" strokeWidth={2.5} /> Your job is ready to post.
                </p>
                <div className="mt-3 rounded-[14px] bg-overlay/90 p-3.5 ring-1 ring-ink/[0.06]">
                  <p className="text-[16px] font-semibold tracking-[-0.01em] text-ink">Weekend Cashier</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {FACTS.map((fact) => (
                      <li key={fact} className="rounded-full bg-brand/[0.07] px-2.5 py-0.5 text-xs font-medium text-charcoal">
                        {fact}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={cn("mt-3 flex flex-wrap gap-2", ROW_SHORT)}>
                  {["Show applicants", "Contact candidates"].map((action) => (
                    <span key={action} className="rounded-full bg-overlay/80 px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink/10">
                      {action}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </figure>
      }
    >
      <Eyebrow>Simple Hire, for small businesses</Eyebrow>
      <Headline id="small-business-title">Just tell Kavuntra who you need.</Headline>
      <Copy>
        For shops, cafés, restaurants and small teams. Say it, typed or out loud. Nothing is posted or sent until
        you&apos;ve seen it and said yes.
      </Copy>
      <Onward href="/signup/employer?mode=simple">Try Simple Hire</Onward>
    </Frame>
  );
}
