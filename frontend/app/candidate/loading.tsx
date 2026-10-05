import { Skeleton } from "@/components/ui/Skeleton";

// Shown inside the portal frame while a page's data loads, so the sidebar never disappears.
export default function CandidateLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2 pt-2 pb-2">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-[252px] rounded-[14px]" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-[216px] rounded-[14px]" />
        ))}
      </div>
    </div>
  );
}
