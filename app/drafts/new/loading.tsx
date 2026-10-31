import { AppFrameSkeleton, HeaderSkeleton, PanelSkeleton } from '@/components/app/page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function NewDraftLoading() {
  return (
    <AppFrameSkeleton>
      <HeaderSkeleton actions={false} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-6 rounded-lg border border-line bg-surface p-4 sm:p-6 lg:col-span-2">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="ml-auto h-11 w-40" />
        </div>
        <div className="flex flex-col gap-6">
          <PanelSkeleton lines={4} />
          <PanelSkeleton lines={3} />
        </div>
      </div>
    </AppFrameSkeleton>
  )
}
