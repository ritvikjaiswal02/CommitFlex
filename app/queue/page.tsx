import type { Metadata } from 'next'
import { AppShell } from '@/components/app-shell'
import { PageHeader } from '@/components/ui/page-header'
import { ErrorState } from '@/components/ui/error-state'
import { getAutopilotSettings, listQueue } from '@/lib/db/queries/autopilot'
import { listRecentDrafts } from '@/lib/db/queries/drafts'
import { QueueBoard } from '@/components/app/queue-board'
import { LinkedInBanner } from '@/components/app/linkedin-banner'
import { RunAutopilotButton } from '@/components/app/run-autopilot-button'
import { computeNextSlots } from '@/components/app/slots'
import { loadPublishingContext, requireAppUser, settle, valueOr } from '@/components/app/server-context'

export const metadata: Metadata = { title: 'Queue' }
export const dynamic = 'force-dynamic'

export default async function QueuePage({
  searchParams,
}: {
  searchParams: { tab?: string; draft?: string; schedule?: string }
}) {
  const { user, timezone } = await requireAppUser('/queue')

  const [items, drafts, settings, publishing] = await Promise.all([
    settle(listQueue(user.id, { limit: 200 }), 'listQueue'),
    settle(listRecentDrafts(user.id, { limit: 100 }), 'listRecentDrafts'),
    settle(getAutopilotSettings(user.id), 'getAutopilotSettings'),
    loadPublishingContext(user.id),
  ])

  const suggestions = settings.ok
    ? computeNextSlots({ ...settings.value, timezone }, new Date(), 5).map((d) => d.toISOString())
    : []

  return (
    <AppShell user={user}>
      <PageHeader
        title="Queue"
        description="Every draft CommitFlex wrote for you, from waiting for review to published."
        actions={<RunAutopilotButton />}
      />
      <LinkedInBanner linkedin={publishing.linkedin} returnTo="/queue" className="mb-6" />
      {items.ok ? (
        <QueueBoard
          initialItems={items.value}
          timezone={timezone}
          linkedinDirect={publishing.linkedinDirect}
          suggestions={suggestions}
          initialTab={searchParams.tab ?? null}
          initialDraftId={searchParams.draft ?? null}
          initialSchedule={searchParams.schedule === '1'}
          unqueued={valueOr(drafts, []).filter((d) => !d.queueStatus)}
        />
      ) : (
        <div className="rounded-lg border border-line bg-surface px-5">
          <ErrorState
            title="Your queue didn't load"
            description="We couldn't reach the database. Reload the page in a moment; your drafts are safe."
          />
        </div>
      )}
    </AppShell>
  )
}
