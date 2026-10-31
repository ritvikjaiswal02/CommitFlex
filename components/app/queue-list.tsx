'use client'

import * as React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { QueueItemView } from '@/types/autopilot'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { StatusNode } from '@/components/ui/status-node'
import { PlatformIcon, platformLabel } from '@/components/brand/platform'
import type { QueueActions } from '@/lib/hooks/use-queue-actions'
import { DraftActions } from '@/components/app/draft-actions'
import { describeWhen, nodeStateFor, triggerLabel } from '@/components/app/queue-meta'

export interface QueueListProps {
  items: QueueItemView[]
  timezone: string
  linkedinDirect: boolean
  actions: QueueActions
  suggestions?: string[]
  onOpen: (item: QueueItemView) => void
  /** Rendered instead of the list when there are no items. */
  empty?: React.ReactNode
  /** Hide the action row (used by compact timelines). */
  hideActions?: boolean
  /** Clamp the preview to this many lines. */
  lines?: 2 | 3 | 4
  className?: string
  'aria-label'?: string
}

const CLAMP = { 2: 'line-clamp-2', 3: 'line-clamp-3', 4: 'line-clamp-4' } as const

/**
 * Queue items as rows on the commit-node rail: one bordered container, rows
 * divided by hairlines, each row's node showing its state. Rows animate
 * their position when the order changes and fade out when they leave.
 */
export function QueueList({
  items,
  timezone,
  linkedinDirect,
  actions,
  suggestions,
  onOpen,
  empty,
  hideActions = false,
  lines = 3,
  className,
  'aria-label': ariaLabel,
}: QueueListProps) {
  const reduceMotion = useReducedMotion()
  const now = new Date()

  if (items.length === 0 && empty) return <>{empty}</>

  return (
    <ul
      aria-label={ariaLabel}
      className={cn('overflow-hidden rounded-lg border border-line bg-surface', className)}
    >
      <AnimatePresence initial={false}>
        {items.map((item, index) => {
          const first = index === 0
          const last = index === items.length - 1
          return (
            <motion.li
              key={item.id}
              layout={reduceMotion ? false : 'position'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: reduceMotion ? 0.1 : 0.16, ease: [0.4, 0, 1, 1] } }}
              transition={{ duration: reduceMotion ? 0.1 : 0.24, ease: [0.2, 0, 0, 1] }}
              data-status={item.status}
              className={cn(
                'relative grid grid-cols-[16px_minmax(0,1fr)] gap-x-3 px-4 py-4 sm:px-5',
                !first && 'border-t border-line',
              )}
            >
              {items.length > 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-6 w-px -translate-x-1/2 bg-line-strong sm:left-7',
                    first ? 'top-[26px]' : 'top-0',
                    last ? 'h-[26px]' : 'bottom-0',
                  )}
                />
              )}
              <div className="relative z-[1] flex h-5 items-start justify-center pt-0.5">
                <span className="inline-flex rounded-full bg-surface ring-4 ring-surface">
                  <StatusNode state={nodeStateFor(item.status)} />
                </span>
              </div>

              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <PlatformIcon platform={item.platform} className="size-3.5" />
                    <span className="text-sm font-medium text-fg">{platformLabel(item.platform)}</span>
                    <span className="truncate font-mono text-xs text-fg-subtle">{item.repoFullName}</span>
                    <Badge variant="outline">{triggerLabel(item.trigger)}</Badge>
                  </div>
                  <span className="text-xs tabular-nums text-fg-muted">{describeWhen(item, timezone, now)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className="group -mx-2 rounded-md px-2 py-1 text-left transition-colors duration-120 hover:bg-sunken/70 focus-ring-surface"
                  aria-label={`Open ${platformLabel(item.platform)} draft for ${item.repoFullName}`}
                >
                  <p className={cn('whitespace-pre-line text-base leading-6 text-fg', CLAMP[lines])}>{item.content}</p>
                </button>

                {item.sourceTitle && (
                  <p className="truncate text-xs text-fg-muted">
                    From <span className="marker">{item.sourceTitle}</span>
                  </p>
                )}
                {item.status === 'failed' && item.lastError && (
                  <p className="text-sm text-danger">{item.lastError}</p>
                )}

                {!hideActions && (
                  <DraftActions
                    draft={{ draftId: item.draftId, platform: item.platform, content: item.content, hashtags: item.hashtags }}
                    item={item}
                    actions={actions}
                    timezone={timezone}
                    linkedinDirect={linkedinDirect}
                    suggestions={suggestions}
                    onEdit={() => onOpen(item)}
                    className="pt-1"
                  />
                )}
              </div>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}

/** Placeholder rows shaped like QueueList. */
export function QueueListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-lg border border-line bg-surface">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn('grid grid-cols-[16px_1fr] gap-x-3 px-4 py-4 sm:px-5', i > 0 && 'border-t border-line')}>
          <div className="pt-0.5">
            <div className="size-4 animate-pulse-soft rounded-full bg-sunken" />
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="h-4 w-48 animate-pulse-soft rounded-sm bg-sunken" />
              <div className="h-3 w-20 animate-pulse-soft rounded-sm bg-sunken" />
            </div>
            <div className="h-4 w-full animate-pulse-soft rounded-sm bg-sunken" />
            <div className="h-4 w-4/5 animate-pulse-soft rounded-sm bg-sunken" />
            <div className="mt-1 flex gap-2">
              <div className="h-8 w-24 animate-pulse-soft rounded-md bg-sunken" />
              <div className="h-8 w-8 animate-pulse-soft rounded-md bg-sunken" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
