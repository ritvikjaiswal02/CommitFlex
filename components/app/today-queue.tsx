'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, CheckCheck, Inbox } from 'lucide-react'
import type { QueueItemView } from '@/types/autopilot'
import { Button, ButtonLink } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusNode } from '@/components/ui/status-node'
import { Timeline, TimelineItem } from '@/components/ui/timeline'
import { PlatformIcon, platformLabel } from '@/components/brand/platform'
import { useQueueActions } from '@/lib/hooks/use-queue-actions'
import { useBulkApprove } from '@/lib/hooks/use-bulk-approve'
import { useEditorSelection, useQueueItems } from '@/lib/hooks/use-queue-items'
import { DraftActions } from '@/components/app/draft-actions'
import { DraftEditorSheet, editorDraftFromItem } from '@/components/app/draft-editor-sheet'
import { QueueList } from '@/components/app/queue-list'
import { capitalize, formatWhen } from '@/components/app/format'
import { describeWhen, nodeStateFor, sortQueue } from '@/components/app/queue-meta'

export interface TodayQueueProps {
  review: QueueItemView[]
  reviewTotal: number
  upNext: QueueItemView[]
  timezone: string
  linkedinDirect: boolean
  suggestions: string[]
}

function SectionHeading({
  id,
  title,
  description,
  action,
}: {
  id: string
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 id={id} className="text-xl font-semibold text-fg">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/**
 * The main column of Today: drafts waiting for review, then the next posts
 * on the rail. Both share one editor sheet and one set of queue actions.
 */
export function TodayQueue({ review, reviewTotal, upNext, timezone, linkedinDirect, suggestions }: TodayQueueProps) {
  const router = useRouter()
  const all = React.useMemo(() => [...review, ...upNext], [review, upNext])
  const { items, upsert, updateContent } = useQueueItems(all)
  const editor = useEditorSelection(items)

  const actions = useQueueActions({
    timezone,
    linkedinDirect,
    onItem: (item) => {
      upsert(item)
      router.refresh()
    },
  })
  const refresh = React.useCallback(() => router.refresh(), [router])
  const bulk = useBulkApprove(upsert, refresh)

  const reviewItems = items.filter((i) => i.status === 'pending_review')
  const nextItems = sortQueue(
    items.filter((i) => ['approved', 'scheduled', 'ready', 'publishing'].includes(i.status)),
  ).slice(0, 6)
  const moreToReview = Math.max(0, reviewTotal - review.length)

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="today-review">
        <SectionHeading
          id="today-review"
          title="Needs your review"
          description={
            reviewItems.length > 0
              ? 'Approve a draft and it takes its slot. Edit first if something reads wrong.'
              : undefined
          }
          action={
            reviewItems.length > 1 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => bulk.approveAll(reviewItems.map((i) => i.draftId))}
                loading={bulk.running}
              >
                <CheckCheck strokeWidth={1.75} aria-hidden="true" />
                Approve all {reviewItems.length}
              </Button>
            ) : undefined
          }
        />
        <QueueList
          aria-label="Drafts that need review"
          items={reviewItems}
          timezone={timezone}
          linkedinDirect={linkedinDirect}
          actions={actions}
          suggestions={suggestions}
          onOpen={editor.openItem}
          empty={
            <div className="rounded-lg border border-line bg-surface px-5">
              <EmptyState
                icon={Inbox}
                title="Nothing waiting for review"
                description="Merge a pull request or run autopilot now, and new drafts show up here."
                action={<ButtonLink href="/drafts/new">Draft something now</ButtonLink>}
              />
            </div>
          }
        />
        {moreToReview > 0 && (
          <Link
            href="/queue?tab=review"
            className="mt-3 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-accent hover:underline focus-ring"
          >
            {moreToReview} more in the queue
          </Link>
        )}
      </section>

      <section aria-labelledby="today-next">
        <SectionHeading
          id="today-next"
          title="Up next"
          action={
            <Link
              href="/calendar"
              className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-accent hover:underline focus-ring"
            >
              Open calendar
            </Link>
          }
        />
        {nextItems.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface px-5">
            <EmptyState
              size="sm"
              icon={CalendarClock}
              title="Nothing scheduled yet"
              description="Approved drafts take the next free slot in your posting schedule."
            />
          </div>
        ) : (
          <div className="rounded-lg border border-line bg-surface p-4 sm:p-5">
            <Timeline aria-label="Upcoming posts">
              {nextItems.map((item) => {
                const when = item.scheduledFor ? capitalize(formatWhen(item.scheduledFor, timezone)) : describeWhen(item, timezone)
                return (
                  <TimelineItem key={item.id} node={<StatusNode state={nodeStateFor(item.status)} />}>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium tabular-nums text-fg">{when}</span>
                        <PlatformIcon platform={item.platform} className="size-3.5" title={platformLabel(item.platform)} />
                        <span className="truncate font-mono text-xs text-fg-subtle">{item.repoFullName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => editor.openItem(item)}
                        className="-mx-2 rounded-md px-2 py-0.5 text-left text-sm text-fg-muted transition-colors duration-120 hover:bg-sunken/70 hover:text-fg focus-ring-surface"
                      >
                        <span className="line-clamp-2">{item.content}</span>
                      </button>
                      {item.status === 'ready' && (
                        <DraftActions
                          draft={{ draftId: item.draftId, platform: item.platform, content: item.content, hashtags: item.hashtags }}
                          item={item}
                          actions={actions}
                          timezone={timezone}
                          linkedinDirect={linkedinDirect}
                          suggestions={suggestions}
                          onEdit={() => editor.openItem(item)}
                        />
                      )}
                    </div>
                  </TimelineItem>
                )
              })}
            </Timeline>
          </div>
        )}
      </section>

      <DraftEditorSheet
        draft={editor.selected ? editorDraftFromItem(editor.selected) : null}
        item={editor.selected}
        open={editor.open}
        onOpenChange={editor.onOpenChange}
        timezone={timezone}
        linkedinDirect={linkedinDirect}
        actions={actions}
        suggestions={suggestions}
        onSaved={updateContent}
      />
    </div>
  )
}
