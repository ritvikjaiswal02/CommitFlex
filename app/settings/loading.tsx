import { AppFrameSkeleton, HeaderSkeleton, TabsSkeleton } from '@/components/app/page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

/** Settings: header, the tab bar, then form sections (label column + controls). */
export default function SettingsLoading() {
  return (
    <AppFrameSkeleton>
      <HeaderSkeleton actions={false} />
      <TabsSkeleton count={6} />
      <div className="mt-8 flex flex-col">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-4 border-t border-line py-8 first:border-t-0 first:pt-0 md:grid-cols-[240px_minmax(0,1fr)] md:gap-10"
          >
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
            <div className="flex flex-col gap-4">
              <Skeleton className="h-9 w-full max-w-md" />
              <Skeleton className="h-9 w-full max-w-md" />
              <Skeleton className="h-20 w-full max-w-md" />
            </div>
          </div>
        ))}
      </div>
    </AppFrameSkeleton>
  )
}
