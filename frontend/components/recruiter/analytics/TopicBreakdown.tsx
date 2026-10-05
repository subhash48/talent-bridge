import type { TopicShare } from "@/types/analytics";

/** One labelled share: the name, a thin ivory bar for its share, then the percentage (and the count). */
export function ShareRow({ label, share, count }: { label: string; share: number; count?: number }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2 first:pt-0 last:pb-0">
      <span className="truncate text-[13px] text-charcoal">{label}</span>
      <span className="flex items-baseline gap-3 text-right tabular-nums">
        <span className="w-9 text-[13px] font-medium text-ink">{share}%</span>
        {count !== undefined && <span className="w-12 text-xs text-faint">{count.toLocaleString()}</span>}
      </span>
      <span aria-hidden className="col-span-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
        <span className="block h-full rounded-full bg-ink/80" style={{ width: `${Math.max(share, share > 0 ? 1.5 : 0)}%` }} />
      </span>
    </li>
  );
}

/** What candidates looked at and asked about, by topic. */
export function TopicBreakdown({ items, total }: { items: TopicShare[]; total: number }) {
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-stone">No portal interactions with a topic in this period yet.</p>;
  }
  return (
    <>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <ShareRow key={item.topic} label={item.label} share={item.share} count={item.count} />
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        {total.toLocaleString()} interactions: page and section views, and the topics of questions to the portal assistant
        (never the questions themselves).
      </p>
    </>
  );
}
