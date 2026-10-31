import type { Metadata } from 'next'
import { CalendarClock, CircleCheck, Inbox, Send } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { ButtonLink } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { ErrorState } from '@/components/ui/error-state'
import { PageHeader } from '@/components/ui/page-header'
import { Stat, StatGroup } from '@/components/ui/stat'
import { getAutopilotSettings, getQueueStats, listQueue, listShipEvents } from '@/lib/db/queries/autopilot'
import { getUserRepos } from '@/lib/db/queries/repos'
import { listVoiceProfiles } from '@/lib/db/queries/voice'
import { listApiTokens } from '@/lib/db/queries/tokens'
import { getUsage } from '@/lib/plans'
import type { QueueStats } from '@/types/autopilot'
import { LinkedInBanner } from '@/components/app/linkedin-banner'
import { TodayQueue } from '@/components/app/today-queue'
import {
  AutopilotPanel,
  PanelError,
  SetupChecklist,
  ShipMomentsPanel,
  UsagePanel,
  type ChecklistStep,
} from '@/components/app/today-panels'
import { computeNextSlots } from '@/components/app/slots'
import { RunAutopilotButton } from '@/components/app/run-autopilot-button'
import { formatWhen, pluralize } from '@/components/app/format'
import { iso, loadPublishingContext, requireAppUser, settle, valueOr } from '@/components/app/server-context'

export const metadata: Metadata = { title: 'Today' }
export const dynamic = 'force-dynamic'

const EMPTY_STATS: QueueStats = {
  pendingReview: 0,
  scheduled: 0,
  ready: 0,
  failed: 0,
  publishedThisMonth: 0,
  nextScheduledAt: null,
}

function headline(stats: QueueStats, timezone: string, now: Date): string {
  if (stats.pendingReview > 0) {
    return `${pluralize(stats.pendingReview, 'draft')} ${stats.pendingReview === 1 ? 'needs' : 'need'} your review.`
  }
  if (stats.ready > 0) return `${pluralize(stats.ready, 'post')} ${stats.ready === 1 ? 'is' : 'are'} ready for you to post.`
  if (stats.nextScheduledAt) {
    return `Nothing needs you. The next post goes out ${formatWhen(stats.nextScheduledAt, timezone, now)}.`
  }
  return 'Nothing needs you right now.'
}

export default async function DashboardPage() {
  const { user, profile, timezone } = await requireAppUser('/dashboard')
  const now = new Date()

  const [stats, review, upNext, settings, events, usage, repos, voices, tokens, publishing] = await Promise.all([
    settle(getQueueStats(user.id), 'getQueueStats'),
    settle(listQueue(user.id, { statuses: ['pending_review'], limit: 5 }), 'listQueue(review)'),
    settle(listQueue(user.id, { statuses: ['approved', 'scheduled', 'ready', 'publishing'], limit: 6 }), 'listQueue(next)'),
    settle(getAutopilotSettings(user.id), 'getAutopilotSettings'),
    settle(listShipEvents(user.id, 6), 'listShipEvents'),
    settle(getUsage(user.id), 'getUsage'),
    settle(getUserRepos(user.id), 'getUserRepos'),
    settle(listVoiceProfiles(user.id), 'listVoiceProfiles'),
    settle(listApiTokens(user.id), 'listApiTokens'),
    loadPublishingContext(user.id),
  ])

  const s = valueOr(stats, EMPTY_STATS)
  const plan = publishing.plan
  const planId = plan?.id ?? 'free'
  const suggestions = settings.ok
    ? computeNextSlots({ ...settings.value, timezone }, now, 5).map((d) => d.toISOString())
    : []

  const platforms = profile?.platforms ?? ['linkedin', 'twitter']
  // The extension step only shows once it can be installed from the store;
  // until then it's an early-access download, not a setup requirement.
  const extensionInStore = !!process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL
  const steps: ChecklistStep[] = [
    {
      key: 'repo',
      label: 'Watch a repository',
      description: 'CommitFlex drafts from the repos you choose.',
      done: valueOr(repos, []).length > 0,
      href: '/repositories',
      cta: 'Add a repository',
    },
    {
      key: 'voice',
      label: 'Teach it your voice',
      description: 'Paste a few posts you wrote so drafts sound like you.',
      done: valueOr(voices, []).some((v) => Boolean(v.extraContext && v.extraContext.trim())),
      href: '/settings?tab=voice',
      cta: 'Set up your voice',
    },
    ...(platforms.includes('linkedin')
      ? [
          {
            key: 'linkedin',
            label: 'Connect LinkedIn',
            description: 'Approved LinkedIn posts publish on their own at their slot.',
            done: publishing.linkedin?.status === 'active',
            href: '/api/integrations/linkedin/connect?returnTo=/dashboard',
            cta: 'Connect LinkedIn',
          },
        ]
      : []),
    ...(extensionInStore
      ? [
          {
            key: 'extension',
            label: 'Add the Chrome extension',
            description: 'Insert drafts straight into the LinkedIn and X composers.',
            done: valueOr(tokens, []).length > 0,
            href: '/extension',
            cta: 'Install the extension',
          },
        ]
      : []),
    {
      key: 'publish',
      label: 'Publish your first post',
      description: 'Approve a draft and let it go out, or post one now.',
      done: s.publishedThisMonth > 0,
      href: '/queue',
      cta: 'Open the queue',
    },
  ]

  const trialEndsAt = iso(plan?.trialEndsAt ?? null)
  const trialDaysLeft =
    plan?.status === 'trialing' && plan.trialEndsAt
      ? Math.ceil((new Date(plan.trialEndsAt).getTime() - now.getTime()) / 86_400_000)
      : null

  const setupIncomplete = steps.some((step) => !step.done)
  const hasActivity = s.publishedThisMonth + s.scheduled + s.ready + s.pendingReview > 0
  const linkedinNeedsReconnect = !!publishing.linkedin && publishing.linkedin.status !== 'active'
  // One page-level message at most, most urgent first.
  const notice: 'failed' | 'linkedin' | 'trial' | null =
    s.failed > 0 ? 'failed' : linkedinNeedsReconnect ? 'linkedin' : trialDaysLeft !== null && trialDaysLeft <= 3 ? 'trial' : null

  return (
    <AppShell user={user}>
      <PageHeader
        title="Today"
        description={stats.ok ? headline(s, timezone, now) : 'Your queue at a glance.'}
        actions={<RunAutopilotButton variant="secondary" />}
      />

      <div className="flex flex-col gap-8">
        {notice === 'linkedin' && <LinkedInBanner linkedin={publishing.linkedin} returnTo="/dashboard" />}

        {notice === 'failed' && (
          <Callout
            tone="danger"
            title={`${pluralize(s.failed, 'post')} failed to publish`}
            action={
              <ButtonLink href="/queue?tab=closed" size="sm" variant="secondary">
                Review failed posts
              </ButtonLink>
            }
          >
            CommitFlex tried three times. Open them to see what the platform said, then retry or reschedule.
          </Callout>
        )}

        {notice === 'trial' && trialDaysLeft !== null && (
          <Callout
            tone="info"
            title={trialDaysLeft <= 0 ? 'Your Pro trial ends today' : `Your Pro trial ends in ${pluralize(trialDaysLeft, 'day')}`}
            action={
              <ButtonLink href="/billing" size="sm">
                Upgrade to Pro
              </ButtonLink>
            }
          >
            After the trial you keep everything, but ship-moment drafts, your posting cadence and direct LinkedIn
            publishing stop. The weekly digest keeps running.
          </Callout>
        )}

        {hasActivity && (
          <StatGroup columns={4}>
            <Stat label="Needs review" icon={Inbox} value={s.pendingReview} />
            <Stat
              label="Scheduled"
              icon={CalendarClock}
              value={s.scheduled}
              hint={s.nextScheduledAt ? `Next ${formatWhen(s.nextScheduledAt, timezone, now)}` : 'Nothing scheduled'}
            />
            <Stat label="Ready to post" icon={Send} value={s.ready} />
            <Stat label="Published this month" icon={CircleCheck} value={s.publishedThisMonth} />
          </StatGroup>
        )}

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
            {/* Below xl the aside stacks under the queue; a new user needs the checklist first. */}
            {setupIncomplete && (
              <div className="xl:hidden">
                <SetupChecklist steps={steps} />
              </div>
            )}
            {review.ok && upNext.ok ? (
              <TodayQueue
                review={review.value}
                reviewTotal={s.pendingReview}
                upNext={upNext.value}
                timezone={timezone}
                linkedinDirect={publishing.linkedinDirect}
                suggestions={suggestions}
              />
            ) : (
              <div className="rounded-lg border border-line bg-surface px-5">
                <ErrorState
                  title="Your queue didn't load"
                  description="We couldn't reach the database. Reload the page in a moment; your drafts are safe."
                />
              </div>
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-6" aria-label="Autopilot and account">
            {setupIncomplete && (
              <div className="hidden xl:block">
                <SetupChecklist steps={steps} />
              </div>
            )}
            {settings.ok ? (
              <AutopilotPanel settings={settings.value} planId={planId} timezone={timezone} now={now} />
            ) : (
              <PanelError
                title="Autopilot"
                labelledBy="panel-autopilot"
                message="Autopilot settings didn't load. Reload to try again."
              />
            )}
            {usage.ok ? (
              <UsagePanel
                usage={usage.value}
                planId={planId}
                planStatus={plan?.status ?? 'free'}
                trialEndsAt={trialEndsAt}
                now={now}
              />
            ) : (
              <PanelError title="Plan and usage" labelledBy="panel-usage" message="Usage didn't load. Reload to try again." />
            )}
            {events.ok ? (
              <ShipMomentsPanel events={events.value} timezone={timezone} now={now} />
            ) : (
              <PanelError
                title="Recent ship moments"
                labelledBy="panel-ships"
                message="Ship moments didn't load. Reload to try again."
              />
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
