import { Skeleton } from '@/components/ui/skeleton'

export default function ApprovalLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-line bg-surface p-6 sm:p-8">
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-3 h-9 w-32" />
      </div>
    </div>
  )
}
