import { AppFrameSkeleton, HeaderSkeleton } from '@/components/app/page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function JobLoading() {
  return (
    <AppFrameSkeleton>
      <HeaderSkeleton />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex flex-col gap-2 p-5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-24 h-4 w-20" />
            </div>
            <div className="flex gap-2 border-t border-line px-5 py-3">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="ml-auto h-8 w-28" />
            </div>
          </div>
        ))}
      </div>
    </AppFrameSkeleton>
  )
}
