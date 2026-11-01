import { Skeleton } from '@/components/ui/skeleton'

/** Shaped like the billing page: header, plan panel beside usage, plan rows, invoices. */
export default function BillingLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading billing">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-48" />
          <div className="mt-2 grid gap-2.5 border-t border-line pt-4 sm:grid-cols-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-4 sm:p-5">
          <Skeleton className="h-6 w-20" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex justify-between gap-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-36" />
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 p-4 sm:p-5 md:flex-row md:items-center md:gap-6">
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-9 w-32" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
