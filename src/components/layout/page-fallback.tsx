import { Skeleton } from '@/components/ui/skeleton';

/** Neutral skeleton shown while a route's code is loading. */
export function PageFallback() {
  return (
    <div className="page-container py-10" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-3 h-5 w-80 max-w-full" />
      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className={i === 3 ? 'hidden aspect-[4/3] rounded-lg lg:block' : 'aspect-[4/3] rounded-lg'} />
        ))}
      </div>
    </div>
  );
}
