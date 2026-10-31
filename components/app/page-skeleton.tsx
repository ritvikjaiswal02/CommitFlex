import * as React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { QueueListSkeleton } from '@/components/app/queue-list'

/**
 * Route-level loading UI. It draws the shell's frame (sidebar column and
 * mobile top bar) so nothing jumps when the real page streams in, plus a
 * body shaped like the page.
 */
export function AppFrameSkeleton({
  children,
  width = 'default',
}: {
  children: React.ReactNode
  width?: 'default' | 'wide' | 'narrow'
}) {
  const max = width === 'wide' ? 'max-w-[1360px]' : width === 'narrow' ? 'max-w-[760px]' : 'max-w-[1120px]'
  return (
    <div className="min-h-dvh bg-canvas" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div
        aria-hidden="true"
        className="fixed inset-y-0 left-0 hidden w-[var(--sidebar-width)] flex-col gap-3 border-r border-line bg-surface p-4 lg:flex"
      >
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-2 h-9 w-full" />
        <div className="mt-3 flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
        <Skeleton className="size-8" />
        <Skeleton className="h-5 w-28" />
      </div>
      <div className="lg:pl-[var(--sidebar-width)]">
        <div className={cn('mx-auto w-full px-4 py-6 sm:px-6 lg:px-10 lg:py-10', max)}>{children}</div>
      </div>
    </div>
  )
}

export function HeaderSkeleton({ actions = true }: { actions?: boolean }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mb-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      {actions && <Skeleton className="h-9 w-36" />}
    </div>
  )
}

export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 bg-surface p-4 sm:p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-12" />
        </div>
      ))}
    </div>
  )
}

export function TabsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex h-10 items-center gap-5 border-b border-line">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-4 w-20" />
      ))}
    </div>
  )
}

export function ListPageSkeleton({ rows = 4, tabs = true }: { rows?: number; tabs?: boolean }) {
  return (
    <AppFrameSkeleton>
      <HeaderSkeleton />
      <div className="flex flex-col gap-6">
        {tabs && <TabsSkeleton />}
        <QueueListSkeleton rows={rows} />
      </div>
    </AppFrameSkeleton>
  )
}

export function PanelSkeleton({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:p-5', className)}>
      <Skeleton className="h-5 w-32" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}
