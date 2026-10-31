import type { Metadata } from 'next'
import { AppShell } from '@/components/app-shell'
import { ButtonLink } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { PageHeader } from '@/components/ui/page-header'
import { getAutopilotSettings, listQueue } from '@/lib/db/queries/autopilot'
import { listRecentDrafts } from '@/lib/db/queries/drafts'
import { CalendarView } from '@/components/app/calendar-view'
import { isCalendarView, normalizeAnchor, rangeFor } from '@/components/app/calendar-utils'
import { computeNextSlots, describeCadence } from '@/components/app/slots'
import { loadPublishingContext, requireAppUser, settle, valueOr } from '@/components/app/server-context'
import type { FillCandidate } from '@/components/app/calendar-view'

export const metadata: Metadata = { title: 'Calendar' }
export const dynamic = 'force-dynamic'

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { view?: string; date?: string }
}) {
  const { user, timezone } = await requireAppUser('/calendar')
  const view = isCalendarView(searchParams.view) ? searchParams.view : 'week'
  const anchor = normalizeAnchor(searchParams.date, timezone)
  const range = rangeFor(view, anchor, timezone)

  const [items, settings, publishing, approved, drafts] = await Promise.all([
    settle(listQueue(user.id, { from: range.start, to: range.end, limit: 200 }), 'listQueue(range)'),
    settle(getAutopilotSettings(user.id), 'getAutopilotSettings'),
    loadPublishingContext(user.id),
    settle(listQueue(user.id, { statuses: ['approved'], limit: 50 }), 'listQueue(approved)'),
    settle(listRecentDrafts(user.id, { limit: 50 }), 'listRecentDrafts'),
  ])

  // What can fill an open slot: approved posts without a time, then drafts never queued.
  const fillCandidates: FillCandidate[] = [
    ...valueOr(approved, [])
      .filter((i) => !i.scheduledFor)
      .map((i) => ({ draftId: i.draftId, platform: i.platform, content: i.content, repoFullName: i.repoFullName, source: 'approved' as const })),
    ...valueOr(drafts, [])
      .filter((d) => !d.queueStatus)
      .map((d) => ({ draftId: d.id, platform: d.platform, content: d.content, repoFullName: d.repoFullName, source: 'unqueued' as const })),
  ]

  const slotRule =
    settings.ok && settings.value.enabled
      ? {
          cadence: settings.value.cadence,
          postDays: settings.value.postDays,
          postTime: settings.value.postTime,
          timezone,
        }
      : null
  const suggestions = slotRule ? computeNextSlots(slotRule, new Date(), 5).map((d) => d.toISOString()) : []

  return (
    <AppShell user={user} width="wide">
      <PageHeader
        title="Calendar"
        description={
          slotRule
            ? `Your posting schedule: ${lowerFirst(describeCadence(slotRule))}.`
            : 'Your queue by day. Turn on autopilot to see open slots from your posting schedule.'
        }
        actions={
          <ButtonLink href="/settings?tab=autopilot" variant="secondary">
            Change schedule
          </ButtonLink>
        }
      />
      {items.ok ? (
        <CalendarView
          initialItems={items.value}
          initialView={view}
          initialAnchor={anchor}
          timezone={timezone}
          linkedinDirect={publishing.linkedinDirect}
          slotRule={slotRule}
          suggestions={suggestions}
          fillCandidates={fillCandidates}
        />
      ) : (
        <div className="rounded-lg border border-line bg-surface px-5">
          <ErrorState
            title="Your calendar didn't load"
            description="We couldn't reach the database. Reload the page in a moment."
          />
        </div>
      )}
    </AppShell>
  )
}
