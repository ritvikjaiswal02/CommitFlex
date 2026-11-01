'use client'

import * as React from 'react'
import Link from 'next/link'
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, LayoutGrid, Plus, Rows3 } from 'lucide-react'
import type { QueueItemView } from '@/types/autopilot'
import type { PostPlatform } from '@/types/posts'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { EmptyState } from '@/components/ui/empty-state'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { NODE_LABELS, StatusNode } from '@/components/ui/status-node'
import { PlatformIcon, platformLabel } from '@/components/brand/platform'
import { useQueueActions } from '@/lib/hooks/use-queue-actions'
import { DraftEditorSheet, editorDraftFromItem } from '@/components/app/draft-editor-sheet'
import {
  dayLabel,
  groupByDay,
  inAnchorMonth,
  rangeFor,
  rangeTitle,
  shiftAnchor,
  type CalendarView as CalendarMode,
} from '@/components/app/calendar-utils'
import { dayKey, formatTime, timeZoneAbbr } from '@/components/app/format'
import { computeNextSlots, type SlotRule } from '@/components/app/slots'

type PlatformFilter = 'all' | PostPlatform

export interface CalendarViewProps {
  initialItems: QueueItemView[]
  initialView: CalendarMode
  initialAnchor: string
  timezone: string
  linkedinDirect: boolean
  slotRule: SlotRule | null
  suggestions: string[]
  /** Drafts that could fill an open slot: approved but unscheduled, or never queued. */
  fillCandidates?: FillCandidate[]
}

export interface FillCandidate {
  draftId: string
  platform: PostPlatform
  content: string
  repoFullName: string
  /** 'approved' (in the queue, no time yet) or 'unqueued'. */
  source: 'approved' | 'unqueued'
}

const VIEW_OPTIONS = [
  { value: 'week' as const, label: 'Week', icon: Rows3 },
  { value: 'month' as const, label: 'Month', icon: LayoutGrid },
]

const PLATFORM_OPTIONS: { value: PlatformFilter; label: string }[] = [
  { value: 'all', label: 'Both' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'twitter', label: 'X' },
]

/** When an item sits on the calendar: its publish time once published, else its slot. */
export function calendarInstant(item: Pick<QueueItemView, 'publishedAt' | 'scheduledFor' | 'status'>): string | null {
  if (item.status === 'published' && item.publishedAt) return item.publishedAt
  return item.scheduledFor
}

function sortByInstant(items: QueueItemView[]): QueueItemView[] {
  return [...items].sort(
    (a, b) => new Date(calendarInstant(a) ?? 0).getTime() - new Date(calendarInstant(b) ?? 0).getTime(),
  )
}

function ItemChip({
  item,
  timezone,
  onOpen,
  dense = false,
}: {
  item: QueueItemView
  timezone: string
  onOpen: (item: QueueItemView) => void
  dense?: boolean
}) {
  const at = calendarInstant(item)
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        'group flex w-full min-w-0 items-start gap-1.5 rounded-md border border-line bg-surface text-left',
        'transition-colors duration-120 hover:border-line-strong hover:bg-sunken/60 focus-ring-surface',
        dense ? 'px-1.5 py-1' : 'px-2 py-1.5',
        item.status === 'skipped' && 'opacity-60',
      )}
      aria-label={`${NODE_LABELS[item.status]} ${platformLabel(item.platform)} post${at ? ` at ${formatTime(at, timezone)}` : ''}: ${item.content.slice(0, 80)}`}
    >
      <span className="mt-0.5 shrink-0">
        <StatusNode state={item.status} size="sm" decorative />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1 text-xs tabular-nums text-fg-muted">
          {at && formatTime(at, timezone)}
          <PlatformIcon platform={item.platform} className="size-3" />
        </span>
        {!dense && <span className="line-clamp-2 text-xs leading-4 text-fg">{item.content}</span>}
      </span>
    </button>
  )
}

/**
 * An empty slot from the posting schedule. Opens a picker of drafts that
 * could go out then, so the calendar fills its own gaps in one click.
 */
function OpenSlot({
  at,
  timezone,
  candidates,
  platform,
  onFill,
}: {
  at: Date
  timezone: string
  candidates: FillCandidate[]
  platform: PlatformFilter
  onFill: (candidate: FillCandidate, at: Date) => Promise<boolean>
}) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const time = formatTime(at, timezone)
  const list = (platform === 'all' ? candidates : candidates.filter((c) => c.platform === platform)).slice(0, 6)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'group flex w-full items-center gap-1.5 rounded-md border border-dashed border-line-strong px-2 py-1.5 text-left text-xs text-fg-subtle',
          'transition-colors duration-120 hover:border-accent hover:bg-accent-soft/40 hover:text-accent-ink focus-ring-surface',
        )}
        aria-label={`Fill the ${time} slot`}
      >
        <span className="tabular-nums">{time}</span>
        <span className="min-w-0 flex-1 truncate">Open slot</span>
        <Plus className="size-3.5 shrink-0 opacity-0 transition-opacity duration-120 group-hover:opacity-100 group-focus-visible:opacity-100" strokeWidth={1.75} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b border-line px-4 py-3">
          <PopoverTitle>Fill the {time} slot</PopoverTitle>
          <PopoverDescription className="text-xs">Pick a draft to schedule for this time.</PopoverDescription>
        </div>
        {list.length === 0 ? (
          <div className="flex flex-col items-start gap-2 px-4 py-4 text-sm text-fg-muted">
            Nothing ready.
            <Link href="/drafts/new" className="rounded-sm font-medium text-accent hover:underline focus-ring-surface">
              Draft one now
            </Link>
          </div>
        ) : (
          <ul className="max-h-72 divide-y divide-line overflow-y-auto">
            {list.map((c) => (
              <li key={c.draftId} className="flex flex-col gap-2 px-4 py-3">
                <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <PlatformIcon platform={c.platform} className="size-3" />
                  <span className="truncate font-mono">{c.repoFullName}</span>
                  <span className="ml-auto shrink-0">{c.source === 'approved' ? 'Approved' : 'Not queued'}</span>
                </span>
                <p className="line-clamp-2 text-sm text-fg">{c.content}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="self-start"
                  loading={busy === c.draftId}
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(c.draftId)
                    const ok = await onFill(c, at)
                    setBusy(null)
                    if (ok) setOpen(false)
                  }}
                >
                  {busy !== c.draftId && <CalendarPlus strokeWidth={1.75} aria-hidden="true" />}
                  Schedule here
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Week and month views of the queue in the user's timezone, with open slots. */
export function CalendarView({
  initialItems,
  initialView,
  initialAnchor,
  timezone,
  linkedinDirect,
  slotRule,
  suggestions,
  fillCandidates = [],
}: CalendarViewProps) {
  const [candidates, setCandidates] = React.useState(fillCandidates)
  React.useEffect(() => setCandidates(fillCandidates), [fillCandidates])
  const [view, setView] = React.useState<CalendarMode>(initialView)
  const [anchor, setAnchor] = React.useState(initialAnchor)
  const [items, setItems] = React.useState(initialItems)
  const [loading, setLoading] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const [platform, setPlatform] = React.useState<PlatformFilter>('all')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const first = React.useRef(true)
  const requestId = React.useRef(0)

  const range = React.useMemo(() => rangeFor(view, anchor, timezone), [view, anchor, timezone])
  const today = dayKey(new Date(), timezone)

  const load = React.useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setFailed(false)
    try {
      const params = new URLSearchParams({
        from: range.start.toISOString(),
        to: range.end.toISOString(),
        limit: '200',
      })
      const res = await fetch(`/api/autopilot/queue?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { items: QueueItemView[] }
      if (id === requestId.current) setItems(data.items ?? [])
    } catch {
      if (id === requestId.current) setFailed(true)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [range.start, range.end])

  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    void load()
    const url = new URL(window.location.href)
    url.searchParams.set('view', view)
    url.searchParams.set('date', anchor)
    window.history.replaceState(null, '', url.toString())
  }, [load, view, anchor])

  const actions = useQueueActions({
    timezone,
    linkedinDirect,
    onItem: (item) => {
      setItems((prev) => {
        const index = prev.findIndex((i) => i.id === item.id)
        if (index === -1) return [...prev, item]
        const next = prev.slice()
        next[index] = item
        return next
      })
    },
  })

  const visible = platform === 'all' ? items : items.filter((i) => i.platform === platform)
  const byDay = groupByDay(sortByInstant(visible), calendarInstant, timezone)

  // Open slots: slot instants in range with no item for that platform filter at that time.
  const openSlots = React.useMemo(() => {
    if (!slotRule) return new Map<string, Date[]>()
    const from = new Date(Math.max(range.start.getTime(), Date.now()))
    const slots = computeNextSlots(slotRule, from, 60).filter((s) => s.getTime() < range.end.getTime())
    const taken = new Set(items.map((i) => (i.scheduledFor ? new Date(i.scheduledFor).getTime() : 0)))
    const map = new Map<string, Date[]>()
    for (const slot of slots) {
      if (taken.has(slot.getTime())) continue
      const key = dayKey(slot, timezone)
      map.set(key, [...(map.get(key) ?? []), slot])
    }
    return map
  }, [slotRule, range.start, range.end, items, timezone])

  const fill = async (candidate: FillCandidate, at: Date): Promise<boolean> => {
    const item = await actions.schedule(candidate.draftId, at)
    if (!item) return false
    setCandidates((prev) => prev.filter((c) => c.draftId !== candidate.draftId))
    return true
  }
  const slotProps = { candidates, platform, onFill: fill }

  const selected = selectedId ? items.find((i) => i.id === selectedId) ?? null : null
  const open = (item: QueueItemView) => {
    setSelectedId(item.id)
    setSheetOpen(true)
  }

  const go = (direction: -1 | 1) => setAnchor((a) => shiftAnchor(view, a, direction, timezone))
  const goToday = () => setAnchor(today)
  const showDay = (day: string) => {
    setView('week')
    setAnchor(day)
  }

  const totalInRange = visible.filter((i) => calendarInstant(i)).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon-sm" onClick={() => go(-1)} aria-label={view === 'week' ? 'Previous week' : 'Previous month'}>
              <ChevronLeft strokeWidth={1.75} aria-hidden="true" />
            </Button>
            <Button variant="secondary" size="icon-sm" onClick={() => go(1)} aria-label={view === 'week' ? 'Next week' : 'Next month'}>
              <ChevronRight strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </div>
          <Button variant="secondary" size="sm" onClick={goToday} disabled={range.days.includes(today)}>
            Today
          </Button>
          <h2 className="ml-1 text-lg font-semibold tabular-nums text-fg" aria-live="polite">
            {rangeTitle(view, anchor, timezone)}
          </h2>
          {loading && <span className="text-sm text-fg-subtle">Loading</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl aria-label="Platform" size="sm" value={platform} onValueChange={setPlatform} options={PLATFORM_OPTIONS} />
          <SegmentedControl aria-label="Calendar view" size="sm" value={view} onValueChange={setView} options={VIEW_OPTIONS} />
          <span className="text-xs text-fg-subtle">Times in {timeZoneAbbr(timezone)}</span>
        </div>
      </div>

      {failed && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          <span>This range didn&rsquo;t load.</span>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}

      {view === 'week' ? (
        <>
          {/* Desktop: seven columns. */}
          <div className="hidden overflow-hidden rounded-lg border border-line bg-line md:grid md:grid-cols-7 md:gap-px" aria-busy={loading}>
            {range.days.map((day) => {
              const label = dayLabel(day, timezone)
              const dayItems = byDay.get(day) ?? []
              const slots = openSlots.get(day) ?? []
              const isToday = day === today
              return (
                <section key={day} aria-label={label.long} className="flex min-h-[320px] flex-col bg-surface">
                  <header className="flex items-baseline gap-1.5 border-b border-line px-2.5 py-2">
                    <span className="text-xs text-fg-muted">{label.weekday}</span>
                    <span
                      className={cn(
                        'inline-flex size-6 items-center justify-center rounded-full text-sm font-medium tabular-nums',
                        isToday ? 'bg-accent text-accent-fg' : 'text-fg',
                      )}
                      aria-current={isToday ? 'date' : undefined}
                    >
                      {label.date}
                    </span>
                  </header>
                  <div className="flex flex-1 flex-col gap-1.5 p-1.5">
                    {dayItems.map((item) => (
                      <ItemChip key={item.id} item={item} timezone={timezone} onOpen={open} />
                    ))}
                    {slots.map((slot) => (
                      <OpenSlot key={slot.toISOString()} at={slot} timezone={timezone} {...slotProps} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>

          {/* Mobile: an agenda. */}
          <ol className="flex flex-col gap-4 md:hidden" aria-label="Agenda">
            {range.days.map((day) => {
              const label = dayLabel(day, timezone)
              const dayItems = byDay.get(day) ?? []
              const slots = openSlots.get(day) ?? []
              if (dayItems.length === 0 && slots.length === 0) return null
              return (
                <li key={day} className="flex flex-col gap-2">
                  <h3 className={cn('text-sm font-medium', day === today ? 'text-accent' : 'text-fg')}>
                    {day === today ? `Today, ${label.long}` : label.long}
                  </h3>
                  <div className="flex flex-col gap-1.5">
                    {dayItems.map((item) => (
                      <ItemChip key={item.id} item={item} timezone={timezone} onOpen={open} />
                    ))}
                    {slots.map((slot) => (
                      <OpenSlot key={slot.toISOString()} at={slot} timezone={timezone} {...slotProps} />
                    ))}
                  </div>
                </li>
              )
            })}
          </ol>
          {totalInRange === 0 && openSlots.size === 0 && !loading && (
            <div className="rounded-lg border border-line bg-surface px-5 md:hidden">
              <EmptyState size="sm" icon={CalendarDays} title="Nothing this week" description="Approved drafts appear here at their slot." />
            </div>
          )}
        </>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-line" aria-busy={loading}>
          <div className="grid grid-cols-7 gap-px" aria-hidden="true">
            {range.days.slice(0, 7).map((day) => (
              <div key={day} className="bg-sunken px-2 py-1.5 text-xs text-fg-muted">
                {dayLabel(day, timezone).weekday}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px border-t border-line">
            {range.days.map((day) => {
              const dayItems = byDay.get(day) ?? []
              const slots = openSlots.get(day) ?? []
              const inMonth = inAnchorMonth(day, anchor)
              const isToday = day === today
              const shown = dayItems.slice(0, 3)
              const more = dayItems.length - shown.length
              const label = dayLabel(day, timezone)
              return (
                <div
                  key={day}
                  className={cn('flex min-h-[64px] flex-col gap-1 p-1 sm:min-h-[112px] sm:p-1.5', inMonth ? 'bg-surface' : 'bg-canvas')}
                >
                  <button
                    type="button"
                    onClick={() => showDay(day)}
                    aria-label={`Show the week of ${label.long}`}
                    className={cn(
                      'inline-flex size-6 items-center justify-center self-start rounded-full text-xs font-medium tabular-nums focus-ring-surface',
                      isToday ? 'bg-accent text-accent-fg' : inMonth ? 'text-fg hover:bg-sunken' : 'text-fg-subtle hover:bg-sunken',
                    )}
                  >
                    {label.date}
                  </button>
                  {/* Small screens: one node per item. */}
                  <div className="flex flex-wrap gap-1 sm:hidden" aria-hidden="true">
                    {dayItems.map((item) => (
                      <StatusNode key={item.id} state={item.status} size="sm" decorative />
                    ))}
                  </div>
                  <div className="hidden flex-col gap-1 sm:flex">
                    {shown.map((item) => (
                      <ItemChip key={item.id} item={item} timezone={timezone} onOpen={open} dense />
                    ))}
                    {more > 0 && (
                      <button
                        type="button"
                        onClick={() => showDay(day)}
                        className="self-start rounded-sm px-1 text-xs font-medium text-accent hover:underline focus-ring-surface"
                      >
                        {more} more
                      </button>
                    )}
                    {dayItems.length === 0 && slots.length > 0 && (
                      <span className="px-1 text-xs text-fg-subtle">
                        {slots.length === 1 ? 'Open slot' : `${slots.length} open slots`}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-fg-subtle">
        Dashed boxes are open slots from your posting schedule: choose one to fill it with a draft. Drafts that still need
        review take a slot but don&rsquo;t post until you approve them.
      </p>

      <DraftEditorSheet
        draft={selected ? editorDraftFromItem(selected) : null}
        item={selected}
        open={sheetOpen && selected !== null}
        onOpenChange={setSheetOpen}
        timezone={timezone}
        linkedinDirect={linkedinDirect}
        actions={actions}
        suggestions={suggestions}
        onSaved={(draftId, content) => {
          setItems((prev) => prev.map((i) => (i.draftId === draftId ? { ...i, content } : i)))
        }}
      />
    </div>
  )
}
