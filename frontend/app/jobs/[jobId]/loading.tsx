// A job's page and its apply page: the shape of one role (heading, facts, a panel), not the board's list of cards.
export default function JobLoading() {
  return (
    <div role="status" className="mx-auto max-w-[1100px] px-5 pt-6 pb-20 sm:px-8 sm:pt-10">
      <span className="sr-only">Loading the role…</span>
      <div aria-hidden className="animate-pulse motion-reduce:animate-none">
        <div className="h-5 w-24 rounded-md bg-ink/10" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div className="h-11 w-11 rounded-xl bg-ink/10" />
            <div className="mt-5 h-10 max-w-md rounded-xl bg-ink/10" />
            <div className="mt-5 h-7 max-w-sm rounded-full bg-ink/5" />
            <div className="sky-card mt-7 h-72 rounded-[20px]" />
          </div>
          <div className="sky-card h-44 rounded-[20px]" />
        </div>
      </div>
    </div>
  );
}
