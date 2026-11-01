'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Search, SearchX } from 'lucide-react'
import type { DraftWithRepo, QueueItemView } from '@/types/autopilot'
import type { PostPlatform } from '@/types/posts'
import { cn } from '@/lib/utils'
import { Button, ButtonLink } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { NODE_LABELS, StatusNode } from '@/components/ui/status-node'
import { PlatformIcon, platformLabel } from '@/components/brand/platform'
import { useQueueActions } from '@/lib/hooks/use-queue-actions'
import { DraftActions } from '@/components/app/draft-actions'
import { DraftEditorSheet, type EditorDraft } from '@/components/app/draft-editor-sheet'
import { RunAutopilotButton } from '@/components/app/run-autopilot-button'
import { formatWhen } from '@/components/app/format'
import { nodeStateFor } from '@/components/app/queue-meta'

type StateFilter = 'all' | 'unqueued' | 'queued' | 'published'
type PlatformFilter = 'all' | PostPlatform

export interface DraftsBrowserProps {
  drafts: DraftWithRepo[]
  queue: QueueItemView[]
  timezone: string
  linkedinDirect: boolean
  suggestions: string[]
  /**
   * 'unqueued' (the Queue page's first tab): only drafts that were never
   * queued, no state filter, and a draft leaves the list once it's added.
   */
  mode?: 'all' | 'unqueued'
  /** Called when a draft from this list gets a queue item. */
  onQueued?: (item: QueueItemView) => void
}

const STATE_OPTIONS: { value: StateFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unqueued', label: 'Not queued' },
  { value: 'queued', label: 'In queue' },
  { value: 'published', label: 'Published' },
]

const PLATFORM_OPTIONS: { value: PlatformFilter; label: string }[] = [
  { value: 'all', label: 'Both' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'twitter', label: 'X' },
]

export function matchesDraftFilters(
  draft: Pick<DraftWithRepo, 'platform' | 'content' | 'repoFullName'>,
  queueStatus: string | null,
  filters: { state: StateFilter; platform: PlatformFilter; query: string },
): boolean {
  if (filters.platform !== 'all' && draft.platform !== filters.platform) return false
  if (filters.state === 'unqueued' && queueStatus) return false
  if (filters.state === 'queued' && (!queueStatus || queueStatus === 'published' || queueStatus === 'skipped')) return false
  if (filters.state === 'published' && queueStatus !== 'published') return false
  const q = filters.query.trim().toLowerCase()
  if (q && !draft.content.toLowerCase().includes(q) && !draft.repoFullName.toLowerCase().includes(q)) return false
  return true
}

/** Every draft, newest first, with filters and the editor sheet. */
export function DraftsBrowser({
  drafts: initialDrafts,
  queue,
  timezone,
  linkedinDirect,
  suggestions,
  mode = 'all',
  onQueued,
}: DraftsBrowserProps) {
  const unqueuedOnly = mode === 'unqueued'
  const router = useRouter()
  const [drafts, setDrafts] = React.useState(initialDrafts)
  const [items, setItems] = React.useState<Record<string, QueueItemView>>(() =>
    Object.fromEntries(queue.map((i) => [i.draftId, i])),
  )
  const [state, setState] = React.useState<StateFilter>('all')
  const [platform, setPlatform] = React.useState<PlatformFilter>('all')
  const [query, setQuery] = React.useState('')
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  React.useEffect(() => setDrafts(initialDrafts), [initialDrafts])
  React.useEffect(() => setItems(Object.fromEntries(queue.map((i) => [i.draftId, i]))), [queue])

  const actions = useQueueActions({
    timezone,
    linkedinDirect,
    onItem: (item) => {
      setItems((prev) => ({ ...prev, [item.draftId]: item }))
      onQueued?.(item)
      router.refresh()
    },
  })

  const statusOf = (d: DraftWithRepo) => items[d.id]?.status ?? d.queueStatus ?? null
  const visible = drafts.filter((d) =>
    matchesDraftFilters(d, statusOf(d), { state: unqueuedOnly ? 'unqueued' : state, platform, query }),
  )
  const filtered = state !== 'all' || platform !== 'all' || query.trim() !== ''

  const open = drafts.find((d) => d.id === openId) ?? null
  const editorDraft: EditorDraft | null = open
    ? {
        draftId: open.id,
        jobId: open.jobId,
        platform: open.platform,
        content: open.content,
        hashtags: open.hashtags,
        repoFullName: open.repoFullName,
        sourceTitle: items[open.id]?.sourceTitle ?? null,
        trigger: items[open.id]?.trigger ?? null,
        createdAt: open.createdAt,
      }
    : null

  const openDraft = (id: string) => {
    setOpenId(id)
    setSheetOpen(true)
  }

  if (unqueuedOnly && drafts.filter((d) => !statusOf(d)).length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface px-5">
        <EmptyState
          icon={FileText}
          title="Every draft is in the queue"
          description="Drafts you didn't queue, like extra variants and manual runs, wait here until you add them."
          action={<ButtonLink href="/drafts/new">Draft a post</ButtonLink>}
        />
      </div>
    )
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface px-5">
        <EmptyState
          icon={FileText}
          title="No drafts yet"
          description="Draft a post from a date range, a pull request or a release, or let autopilot write from your latest work."
          action={<ButtonLink href="/drafts/new">Draft a post</ButtonLink>}
          secondaryAction={<RunAutopilotButton variant="ghost" />}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {!unqueuedOnly && (
            <SegmentedControl aria-label="Queue state" size="sm" value={state} onValueChange={setState} options={STATE_OPTIONS} />
          )}
          <SegmentedControl aria-label="Platform" size="sm" value={platform} onValueChange={setPlatform} options={PLATFORM_OPTIONS} />
        </div>
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search text or repository"
          aria-label="Search drafts"
          leadingIcon={Search}
          className="lg:max-w-xs"
        />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface px-5">
          <EmptyState
            size="sm"
            icon={SearchX}
            title="No drafts match"
            description="Try another filter or clear the search."
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setState('all')
                    setPlatform('all')
                    setQuery('')
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul aria-label="Drafts" className="overflow-hidden rounded-lg border border-line bg-surface">
          {visible.map((draft, index) => {
            const item = items[draft.id] ?? null
            const status = item?.status ?? draft.queueStatus ?? null
            const knownItem = item !== null || !draft.queueStatus
            return (
              <li
                key={draft.id}
                className={cn(
                  'grid grid-cols-[16px_minmax(0,1fr)] gap-x-3 px-4 py-4 sm:px-5',
                  index > 0 && 'border-t border-line',
                )}
              >
                <div className="pt-0.5">
                  <StatusNode state={nodeStateFor(status)} decorative />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <PlatformIcon platform={draft.platform} className="size-3.5" />
                      <span className="text-sm font-medium text-fg">{platformLabel(draft.platform)}</span>
                      <span className="truncate font-mono text-xs text-fg-subtle">{draft.repoFullName}</span>
                    </div>
                    <span className="flex items-center gap-3 text-xs text-fg-muted">
                      <span>{NODE_LABELS[nodeStateFor(status)]}</span>
                      <span className="tabular-nums">{formatWhen(draft.createdAt, timezone)}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openDraft(draft.id)}
                    className="-mx-2 rounded-md px-2 py-1 text-left transition-colors duration-120 hover:bg-sunken/70 focus-ring-surface"
                    aria-label={`Open ${platformLabel(draft.platform)} draft for ${draft.repoFullName}`}
                  >
                    <p className="line-clamp-2 whitespace-pre-line text-base leading-6 text-fg">{draft.content}</p>
                  </button>
                  {knownItem ? (
                    <DraftActions
                      draft={{ draftId: draft.id, platform: draft.platform, content: draft.content, hashtags: draft.hashtags }}
                      item={item}
                      actions={actions}
                      timezone={timezone}
                      linkedinDirect={linkedinDirect}
                      suggestions={suggestions}
                      onEdit={() => openDraft(draft.id)}
                    />
                  ) : (
                    <Link
                      href={`/queue?draft=${draft.id}`}
                      className="self-start rounded-sm text-sm font-medium text-accent hover:underline focus-ring-surface"
                    >
                      Open in queue
                    </Link>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-xs text-fg-subtle">
        {unqueuedOnly
          ? `${visible.length} ${visible.length === 1 ? 'draft' : 'drafts'} not in the queue.`
          : `Showing ${visible.length} of ${drafts.length} recent drafts.`}
      </p>

      <DraftEditorSheet
        draft={editorDraft}
        item={open ? items[open.id] ?? null : null}
        open={sheetOpen && editorDraft !== null}
        onOpenChange={setSheetOpen}
        timezone={timezone}
        linkedinDirect={linkedinDirect}
        actions={actions}
        suggestions={suggestions}
        onSaved={(draftId, content) => {
          setDrafts((prev) => prev.map((d) => (d.id === draftId ? { ...d, content } : d)))
          setItems((prev) => (prev[draftId] ? { ...prev, [draftId]: { ...prev[draftId], content } } : prev))
        }}
      />
    </div>
  )
}
