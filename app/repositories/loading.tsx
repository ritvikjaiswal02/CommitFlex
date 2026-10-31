import { AppFrameSkeleton, HeaderSkeleton } from '@/components/app/page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function RepositoriesLoading() {
  return (
    <AppFrameSkeleton>
      <HeaderSkeleton actions={false} />
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          {[0, 1, 2].map((i) => (
            <div key={i} className={i > 0 ? 'flex flex-col gap-4 border-t border-line p-5' : 'flex flex-col gap-4 p-5'}>
              <div className="flex justify-between">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-4 w-72 max-w-full" />
                </div>
                <Skeleton className="size-8" />
              </div>
              <div className="flex gap-8">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-8 w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppFrameSkeleton>
  )
}
