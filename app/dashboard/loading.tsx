import { QueueListSkeleton } from '@/components/app/queue-list'
import {
  AppFrameSkeleton,
  HeaderSkeleton,
  PanelSkeleton,
  StatRowSkeleton,
} from '@/components/app/page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <AppFrameSkeleton>
      <HeaderSkeleton />
      <div className="flex flex-col gap-8">
        <StatRowSkeleton />
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
          <div className="flex flex-col gap-3 xl:col-span-2">
            <Skeleton className="h-6 w-44" />
            <QueueListSkeleton rows={3} />
          </div>
          <div className="flex flex-col gap-6">
            <PanelSkeleton lines={4} />
            <PanelSkeleton lines={3} />
          </div>
        </div>
      </div>
    </AppFrameSkeleton>
  )
}
