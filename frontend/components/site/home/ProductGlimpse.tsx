import { ArrowRight, ListChecks, MessageSquareText, Radar, Sparkles, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { HomeSection } from "@/components/site/home/HomeSection";
import { buttonStyles } from "@/components/ui/Button";

// What the product does, in the order it happens to a hire.
const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Radar, title: "Communication gaps, noticed", text: "A stage change nobody mentioned, a question with no reply, an interview with no follow-up: Today shows who's waiting." },
  { icon: MessageSquareText, title: "Updates, drafted", text: "One message each, written from the candidate's own application. You review it; nothing is sent until you approve." },
  { icon: Sparkles, title: "An assistant that does the work", text: "Ask in your own words, typed or spoken. It drafts jobs, finds matches and proposes times, with the reasons shown." },
  { icon: ListChecks, title: "Every application, followed", text: "Candidates see where each application stands, what comes next, their messages and their interviews, in one portal." },
];

/*
 * The photograph: "Four coworkers smiling around laptop at table" by Jud Mackrill on Unsplash,
 * https://unsplash.com/photos/four-coworkers-smiling-around-laptop-at-table-Of_m3hMsoAA, free to use under the
 * Unsplash License (https://unsplash.com/license; not an Unsplash+ image). Stock models, not Hirvello's team or
 * customers. Downloaded on 2026-11-03 as a 1200×800 crop into public/images/product/.
 */
const PHOTO = {
  src: "/images/product/team-around-laptop.jpg",
  alt: "Four colleagues smiling around a laptop at a wooden table in a bright office",
};

/** The product, glimpsed: a still of Today beside what Hirvello does, feature by feature. */
export function ProductGlimpse() {
  return (
    <HomeSection
      id="product"
      size="wide"
      className="steps-sky [--sky-mask:linear-gradient(to_bottom,transparent_0%,#000_18%,#000_82%,transparent_100%)]"
      eyebrow="The product"
      title="A hiring system that keeps its word."
      intro="Everything Hirvello does is in service of one promise: nobody in your hiring process is left guessing."
    >
      <div className="mt-12 grid grid-cols-1 items-center gap-12 lg:mt-14 lg:grid-cols-[52fr_48fr] lg:gap-10 xl:gap-12">
        <figure className="reveal rounded-[20px] bg-accent-soft/55 p-3 ring-1 ring-accent-soft/80 sm:p-4">
          <div className="relative overflow-hidden rounded-[14px]">
            <Image
              src={PHOTO.src}
              alt={PHOTO.alt}
              width={1200}
              height={800}
              sizes="(min-width: 1280px) 620px, (min-width: 1024px) 50vw, 100vw"
              className="aspect-[3/2] w-full object-cover"
            />
            {/* A still of Today, over the table and clear of everyone's face: a small chip in the corner on a phone, a
                card from sm. Its corner follows the photo's (14px less the inset). Decorative: the features say it. */}
            <div
              aria-hidden
              className="absolute bottom-2 left-2 w-fit rounded-md bg-accent-soft/85 px-3 py-2 ring-1 ring-white/60 backdrop-blur-md sm:bottom-4 sm:left-4 sm:w-[min(15rem,60%)] sm:rounded-xl sm:px-4 sm:py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-medium text-ink sm:text-lg">Today</p>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-accent" />
                  <span className="size-2 rounded-full bg-accent-soft ring-1 ring-accent/50" />
                </span>
              </div>
              <p className="text-xs text-charcoal sm:text-sm">3 updates to review</p>
            </div>
          </div>
        </figure>

        <ul className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="reveal grid grid-cols-[auto_1fr] gap-x-4">
              <Icon aria-hidden className="mt-0.5 size-6 text-accent" strokeWidth={1.75} />
              <div>
                <h3 className="text-xl font-semibold text-balance text-ink">{title}</h3>
                <p className="mt-2 text-base text-pretty text-charcoal">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-10 flex justify-center">
        <Link href="/product" className={buttonStyles({ variant: "secondary", size: "lg", className: "group" })}>
          See the whole product
          <ArrowRight aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </HomeSection>
  );
}
