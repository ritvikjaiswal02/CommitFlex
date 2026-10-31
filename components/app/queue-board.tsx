'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, CheckCheck, CircleCheck, Inbox, Send, SkipForward } from 'lucide-react'
import type { DraftWithRepo, QueueItemView } from '@/types/autopilot'
import type { PostPlatform } from '@/types/posts'
import { Button, ButtonLink } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useQueueActions } from '@/lib/hooks/use-queue-actions'
import { useBulkApprove } from '@/lib/hooks/use-bulk-approve'
import { useEditorSelection, useQueueItems } from '@/lib/hooks/use-queue-items'
import { DraftEditorSheet, editorDraftFromItem } from '@/components/app/draft-editor-sheet'
import { QueueList } from '@/components/app/queue-list'
import { DraftsBrowser } from '@/components/app/drafts-browser'
import { ScheduleDialog } from '@/components/app/schedule-dialog'
import {
  QUEUE_TABS,
  UNQUEUED_TAB,
  countByTab,
  isQueueTabKey,
  sortByRecent,
  sortQueue,
  type QueueTabKey,
} from '@/components/app/queue-meta'

type PlatformFilter = 'all' | PostPlatform
type BoardTab = QueueTabKey | 'unqueued'

export interface QueueBoardProps {
  initialItems: QueueItemView[]
  timezone: string
  linkedinDirect: boolean
  suggestions: string[]
  initialTab?: string | null
  initialDraftId?: string | null
  /** Recent drafts with no queue item (the Unqueued tab). */
  unqueued?: DraftWithRepo[]
  /** `?schedule=1`: open the schedule dialog for `initialDraftId`. */
  initialSchedule?: boolean
}

const PLATFORM_OPTIONS: { value: PlatformFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'twitter', label: 'X' },
]

function emptyFor(tab: QueueTabKey) {
  switch (tab) {
    case 'review':
      return (
        <EmptyState
          icon={Inbox}
          title="Nothing waiting for review"
          description="Merge a pull request or run autopilot now, and new drafts show up here for you to approve."
          action={<ButtonLink href="/drafts/new">Draft something now</ButtonLink>}
        />
      )
    case 'scheduled':
      return (
        <EmptyState
          icon={CalendarClock}
          title="Nothing scheduled"
          description="Approve a draft, or add one from Unqueued, and it takes the next free slot."
          action={<ButtonLink href="/queue?tab=unqueued" variant="secondary">See unqueued drafts</ButtonLink>}
        />
      )
    case 'ready':
      return (
        <EmptyState
          icon={Send}
          title="Nothing ready to post"
          description="When a slot arrives for a post you publish yourself, it waits here with a one-tap Post button."
        />
      )
    case 'published':
      return (
        <EmptyState
          icon={CircleCheck}
          title="Nothing published yet"
          description="Published posts collect here with links to where they went live."
        />
      )
    case 'closed':
      return (
        <EmptyState
          icon={SkipForward}
          title="No failed or skipped posts"
          description="Posts you skip and posts that fail after three attempts end up here, so nothing disappears."
        />
      )
  }
}

/** The full queue: tabs by state (synced to `?tab=`), a platform filter and the editor sheet. */
export function QueueBoard({
  initialItems,
  timezone,
  linkedinDirect,
  suggestions,
  initialTab,
  initialDraftId,
  unqueued = [],
  initialSchedule = false,
}: QueueBoardProps) {
  const router = useRouter()
  const { items, upsert, updateContent } = useQueueItems(initialItems)
  const editor = useEditorSelection(items, initialDraftId)
  const [platform, setPlatform] = React.useState<PlatformFilter>('all')
  const [unqueuedDrafts, setUnqueuedDrafts] = React.useState(unqueued)
  React.useEffect(() => setUnqueuedDrafts(unqueued), [unqueued])
  const [tab, setTab] = React.useState<BoardTab>(() => {
    if (initialTab === UNQUEUED_TAB.key) return 'unqueued'
    if (isQueueTabKey(initialTab)) return initialTab
    const draft = initialDraftId ? initialItems.find((i) => i.draftId === initialDraftId) : null
    if (draft) return QUEUE_TABS.find((t) => t.statuses.includes(draft.status))?.key ?? 'review'
    return 'review'
  })

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

  const visible = React.useMemo(
    () => (platform === 'all' ? items : items.filter((i) => i.platform === platform)),
    [items, platform],
  )
  const counts = countByTab(visible)

  // "Change the time" from the approval page lands here with ?schedule=1.
  const scheduleTarget = initialSchedule && initialDraftId ? initialItems.find((i) => i.draftId === initialDraftId) ?? null : null
  const [scheduleOpen, setScheduleOpen] = React.useState(!!scheduleTarget)

  const changeTab = (next: string) => {
    if (next !== UNQUEUED_TAB.key && !isQueueTabKey(next)) return
    setTab(next as BoardTab)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    url.searchParams.delete('draft')
    window.history.replaceState(null, '', url.toString())
  }

  return (
    <>
      <Tabs value={tab} onValueChange={changeTab}>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
          <TabsList aria-label="Queue states" className="md:flex-1">
            {unqueuedDrafts.length > 0 && (
              <TabsTrigger value={UNQUEUED_TAB.key} count={unqueuedDrafts.length} shortLabel={UNQUEUED_TAB.shortLabel}>
                {UNQUEUED_TAB.label}
              </TabsTrigger>
            )}
            {QUEUE_TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} count={counts[t.key]} shortLabel={t.shortLabel}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <SegmentedControl
            aria-label="Platform"
            size="sm"
            value={platform}
            onValueChange={setPlatform}
            options={PLATFORM_OPTIONS}
            className="self-start md:mb-1.5"
          />
        </div>

        <TabsContent value={UNQUEUED_TAB.key} className="flex flex-col gap-3">
          <DraftsBrowser
            mode="unqueued"
            drafts={unqueuedDrafts}
            queue={[]}
            timezone={timezone}
            linkedinDirect={linkedinDirect}
            suggestions={suggestions}
            onQueued={(item) => {
              upsert(item)
              setUnqueuedDrafts((prev) => prev.filter((d) => d.id !== item.draftId))
            }}
          />
        </TabsContent>

        {QUEUE_TABS.map((t) => {
          const inTab = visible.filter((i) => t.statuses.includes(i.status))
          const ordered = t.key === 'published' || t.key === 'closed' ? sortByRecent(inTab) : sortQueue(inTab)
          return (
            <TabsContent key={t.key} value={t.key} className="flex flex-col gap-3">
              {t.key === 'review' && ordered.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-fg-muted">Approve a draft and it takes the next free slot.</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => bulk.approveAll(ordered.map((i) => i.draftId))}
                    loading={bulk.running}
                  >
                    <CheckCheck strokeWidth={1.75} aria-hidden="true" />
                    Approve all {ordered.length}
                  </Button>
                </div>
              )}
              <QueueList
                aria-label={t.label}
                items={ordered}
                timezone={timezone}
                linkedinDirect={linkedinDirect}
                actions={actions}
                suggestions={suggestions}
                onOpen={editor.openItem}
                empty={<div className="rounded-lg border border-line bg-surface px-5">{emptyFor(t.key)}</div>}
              />
            </TabsContent>
          )
        })}
      </Tabs>

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

      {scheduleTarget && (
        <ScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          platform={scheduleTarget.platform}
          current={scheduleTarget.scheduledFor}
          timezone={timezone}
          suggestions={suggestions}
          onConfirm={async (at) => {
            const ok = await actions.schedule(scheduleTarget.draftId, at)
            if (ok) setScheduleOpen(false)
          }}
        />
      )}
    </>
  )
}
