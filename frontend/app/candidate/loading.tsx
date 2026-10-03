import { Skeleton } from "@/components/ui/Skeleton";

// Shown inside the portal frame while a page's data loads, so the sidebar never disappears.
export default function CandidateLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-3 pt-2 pb-2">
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-[280px] rounded-[18px]" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-[240px] rounded-[18px]" />
        ))}
      </div>
    </div>
  );
}
