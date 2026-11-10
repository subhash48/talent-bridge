export default function JobsLoading() {
  return (
    <div role="status" className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8">
      <span className="sr-only">Loading jobs…</span>
      <div aria-hidden className="animate-pulse motion-reduce:animate-none">
        <div className="mx-auto h-12 max-w-lg rounded-xl bg-ink/10" />
        <div className="mx-auto mt-6 h-14 max-w-3xl rounded-xl bg-ink/5" />
        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((key) => <div key={key} className="sky-card h-60 rounded-[20px]" />)}
        </div>
      </div>
    </div>
  );
}
