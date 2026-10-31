import { AppFrameSkeleton, HeaderSkeleton, PanelSkeleton, StatRowSkeleton } from '@/components/app/page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function AnalyticsLoading() {
  return (
    <AppFrameSkeleton>
      <HeaderSkeleton />
      <div className="flex flex-col gap-8">
        <StatRowSkeleton />
        <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
          <Skeleton className="h-5 w-40" />
          <div className="flex h-[200px] items-end gap-1">
            {Array.from({ length: 30 }, (_, i) => (
              <Skeleton key={i} className="flex-1" style={{ height: `${20 + ((i * 37) % 70)}%` }} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <PanelSkeleton lines={4} />
          <PanelSkeleton lines={4} />
        </div>
      </div>
    </AppFrameSkeleton>
  )
}
