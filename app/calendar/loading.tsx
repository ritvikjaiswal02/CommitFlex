import { AppFrameSkeleton, HeaderSkeleton } from '@/components/app/page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function CalendarLoading() {
  return (
    <AppFrameSkeleton width="wide">
      <HeaderSkeleton />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-8 w-72" />
        </div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex min-h-[120px] flex-col gap-2 bg-surface p-2 md:min-h-[320px]">
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-12 w-full" />
              {i % 2 === 0 && <Skeleton className="h-12 w-full" />}
            </div>
          ))}
        </div>
      </div>
    </AppFrameSkeleton>
  )
}
