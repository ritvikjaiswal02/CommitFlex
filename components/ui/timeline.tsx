import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The commit-node rail: a vertical 1px line that connects StatusNodes, like
 * commits on a branch. Use inside a surface (`bg-surface`) container so the
 * ring around each node blends with the background.
 */
export function Timeline({ className, ...props }: React.OlHTMLAttributes<HTMLOListElement>) {
  return <ol data-slot="timeline" className={cn('flex flex-col', className)} {...props} />
}

export interface TimelineItemProps {
  /** Usually a <StatusNode />. */
  node: React.ReactNode
  children: React.ReactNode
  /** Hides the rail below this item. The last child of a Timeline hides it automatically. */
  last?: boolean
  className?: string
}

export function TimelineItem({ node, children, last = false, className }: TimelineItemProps) {
  return (
    <li data-slot="timeline-item" className={cn('group/tl relative flex gap-3 pb-6 last:pb-0', className)}>
      {!last && (
        <span
          aria-hidden="true"
          className="absolute -bottom-3 left-2 top-3 w-px -translate-x-1/2 bg-line-strong group-last/tl:hidden"
        />
      )}
      <span className="relative z-[1] flex h-6 w-4 shrink-0 items-center justify-center">
        <span className="inline-flex rounded-full bg-surface ring-2 ring-surface">{node}</span>
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  )
}
