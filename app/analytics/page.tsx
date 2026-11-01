import type { Metadata } from 'next'
import { TZDate } from '@date-fns/tz'
import { addDays, format } from 'date-fns'
import { ChartNoAxesColumn, ChevronDown, Flame, GitMerge, Gauge, Timer } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { ButtonLink } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { PageHeader } from '@/components/ui/page-header'
import { Stat, StatGroup } from '@/components/ui/stat'
import { PaywallGate } from '@/components/billing/paywall-gate'
import { getPublishStats, listPublishedTimes, listShipOutcomes } from '@/lib/db/queries/publish'
import { getAutopilotSettings } from '@/lib/db/queries/autopilot'
import { cadenceTargetPerWeek, formatDuration, postingStreakWeeks, shipToPost } from '@/lib/insights'
import { getUserJobs } from '@/lib/db/queries/jobs'
import { getUserRepos } from '@/lib/db/queries/repos'
import { planHasFeature } from '@/lib/billing/catalog'
import type { JobTrigger, PublishMethod } from '@/types/autopilot'
import { BarList, StackedBarChart, type StackDatum } from '@/components/app/charts'
import { RangePicker, type AnalyticsRange } from '@/components/app/range-picker'
import { METHOD_LABELS, triggerLabel } from '@/components/app/queue-meta'
import { dayKey, pluralize } from '@/components/app/format'
import { loadPublishingContext, requireAppUser, settle, valueOr } from '@/components/app/server-context'

export const metadata: Metadata = { title: 'Insights' }
export const dynamic = 'force-dynamic'

const RANGES: readonly AnalyticsRange[] = ['7', '30', '90']

function isRange(value: unknown): value is AnalyticsRange {
  return typeof value === 'string' && (RANGES as readonly string[]).includes(value)
}

/** The last `days` calendar days in `tz`, oldest first, plus the instant the first one starts. */
function windowDays(days: number, tz: string, now: Date) {
  const today = new TZDate(now.getTime(), tz)
  const start = new TZDate(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1), 0, 0, 0, 0, tz)
  const keys: { key: string; short: string; long: string }[] = []
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i)
    keys.push({ key: format(d, 'yyyy-MM-dd'), short: format(d, 'd MMM'), long: format(d, 'EEE, d MMM') })
  }
  return { from: new Date(start.getTime()), keys }
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <h2 id={id} className="text-base font-semibold text-fg">
        {title}
      </h2>
      {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default async function InsightsPage({ searchParams }: { searchParams: { range?: string } }) {
  const { user, timezone } = await requireAppUser('/analytics')
  const publishing = await loadPublishingContext(user.id)
  const planId = publishing.plan?.id ?? 'free'
  const advanced = planHasFeature(planId, 'analytics.advanced')
  const requested: AnalyticsRange = isRange(searchParams.range) ? searchParams.range : advanced ? '30' : '7'
  const range: AnalyticsRange = advanced ? requested : '7'
  const days = Number(range)
  const now = new Date()
  const { from, keys } = windowDays(days, timezone, now)

  const yearAgo = new Date(now.getTime() - 365 * 24 * 3600_000)
  const [stats, jobs, repos, publishedTimes, shipOutcomes, settings] = await Promise.all([
    settle(getPublishStats(user.id, { from, to: now }), 'getPublishStats'),
    settle(getUserJobs(user.id, 300), 'getUserJobs'),
    settle(getUserRepos(user.id), 'getUserRepos'),
    settle(listPublishedTimes(user.id, yearAgo), 'listPublishedTimes'),
    settle(listShipOutcomes(user.id, { from, to: now }), 'listShipOutcomes'),
    settle(getAutopilotSettings(user.id), 'getAutopilotSettings'),
  ])

  const header = (
    <PageHeader
      title="Insights"
      description="Whether posting in public is keeping up with what you ship."
      actions={<RangePicker value={range} advanced={advanced} />}
    />
  )

  if (!stats.ok) {
    return (
      <AppShell user={user}>
        {header}
        <div className="rounded-lg border border-line bg-surface px-5">
          <ErrorState title="Insights didn't load" description="We couldn't reach the database. Reload the page in a moment." />
        </div>
      </AppShell>
    )
  }

  const { byDay, byTrigger, byMethod, totals } = stats.value
  const dayMap = new Map(byDay.map((d) => [d.date, d]))
  const chartData: StackDatum[] = keys.map((k) => {
    const row = dayMap.get(k.key)
    const linkedin = row?.linkedin ?? 0
    const twitter = row?.twitter ?? 0
    const values: Record<string, number> = advanced ? { linkedin, twitter } : { total: linkedin + twitter }
    return {
      label: k.short,
      longLabel: k.long,
      values,
    }
  })
  const series = advanced
    ? [
        { key: 'linkedin', label: 'LinkedIn', className: 'bg-accent' },
        { key: 'twitter', label: 'X', className: 'bg-fg/60' },
      ]
    : [{ key: 'total', label: 'Published', className: 'bg-accent' }]

  const linkedinTotal = byDay.reduce((sum, d) => sum + d.linkedin, 0)
  const twitterTotal = byDay.reduce((sum, d) => sum + d.twitter, 0)

  // Consistency: the numbers a builder posting in public cares about.
  const streak = postingStreakWeeks(valueOr(publishedTimes, []), timezone, now)
  const weeks = days / 7
  const perWeek = totals.published / weeks
  const target = settings.ok ? cadenceTargetPerWeek(settings.value.cadence, settings.value.postDays) : null
  const ships = shipToPost(valueOr(shipOutcomes, []))
  const perWeekLabel = perWeek >= 10 ? String(Math.round(perWeek)) : String(Math.round(perWeek * 10) / 10)

  const triggerRows = [...byTrigger]
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((t) => ({ key: t.trigger, label: triggerLabel(t.trigger as JobTrigger), value: t.count }))
  const methodRows = [...byMethod]
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((m) => ({ key: m.method, label: METHOD_LABELS[m.method as PublishMethod] ?? m.method, value: m.count }))

  const repoNames = new Map(valueOr(repos, []).map((r) => [r.id, r.fullName]))
  const fromKey = keys[0]?.key ?? ''
  const runsByRepo = new Map<string, number>()
  for (const job of valueOr(jobs, [])) {
    if (dayKey(job.createdAt, timezone) < fromKey) continue
    runsByRepo.set(job.repoId, (runsByRepo.get(job.repoId) ?? 0) + 1)
  }
  const repoRows = Array.from(runsByRepo.entries())
    .map(([id, count]) => ({
      key: id,
      label: <span className="font-mono text-xs">{repoNames.get(id) ?? 'Removed repository'}</span>,
      value: count,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  const nothing = totals.published === 0 && totals.drafted === 0 && repoRows.length === 0 && ships.ships === 0 && streak === 0
  const topTrigger = triggerRows[0]
  const summary =
    totals.published > 0
      ? `You posted ${pluralize(totals.published, 'time')} in the last ${days} days` +
        (advanced && linkedinTotal > 0 && twitterTotal > 0 ? `: ${linkedinTotal} on LinkedIn and ${twitterTotal} on X.` : '.') +
        (topTrigger ? ` ${topTrigger.label} produced the most drafts.` : '')
      : totals.drafted > 0
        ? `CommitFlex drafted ${pluralize(totals.drafted, 'post')} in the last ${days} days, and none went out yet. Approve a few from the queue.`
        : null

  return (
    <AppShell user={user}>
      {header}

      {nothing ? (
        <div className="rounded-lg border border-line bg-surface px-5">
          <EmptyState
            icon={ChartNoAxesColumn}
            title={`No activity in the last ${days} days`}
            description="Insights fill in as you ship and post: your posting streak, how many ships got a post, and how fast."
            action={<ButtonLink href="/drafts/new">Draft a post</ButtonLink>}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {summary && <p className="max-w-prose text-lg text-fg">{summary}</p>}

          <StatGroup columns={4}>
            <Stat
              label="Posting streak"
              icon={Flame}
              value={streak === 0 ? 'None' : pluralize(streak, 'week')}
              hint={streak > 0 ? 'Weeks in a row with a post' : 'Post this week to start one'}
            />
            <Stat
              label="Posts per week"
              icon={Gauge}
              value={perWeekLabel}
              hint={target !== null ? `Your cadence aims for ${target}` : 'Ship moments set the pace'}
            />
            <Stat
              label="Ship-to-post rate"
              icon={GitMerge}
              value={ships.rate === null ? 'No ships' : `${Math.round(ships.rate * 100)}%`}
              hint={ships.ships > 0 ? `${ships.posted} of ${pluralize(ships.ships, 'merge or release', 'merges and releases')} posted` : 'Merged PRs and releases'}
            />
            <Stat
              label="Merge to post"
              icon={Timer}
              value={ships.medianLagMs === null ? 'Not yet' : formatDuration(ships.medianLagMs)}
              hint="Median time from shipping to posting"
            />
          </StatGroup>

          <Section
            id="analytics-daily"
            title="Published per day"
            description={advanced ? 'By platform, in your timezone.' : 'In your timezone. Pro splits this by platform.'}
          >
            <StackedBarChart data={chartData} series={series} title={`Posts published per day, last ${days} days`} />
          </Section>

          <PaywallGate
            plan={planId}
            feature="analytics.advanced"
            title="See what your posts came from"
            description="Pro breaks posts down by what triggered them: merged PRs, releases or the weekly digest."
          >
            <Section id="analytics-trigger" title="Posts by source" description="What started the run each post came from.">
              <BarList
                title="Posts by source"
                rows={triggerRows}
                empty={<p className="text-sm text-fg-muted">Nothing published in this range.</p>}
              />
            </Section>
          </PaywallGate>

          <details className="group rounded-lg border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium text-fg focus-ring-surface sm:px-5 [&::-webkit-details-marker]:hidden">
              Details
              <ChevronDown className="size-4 text-fg-subtle transition-transform duration-180 group-open:rotate-180" strokeWidth={1.75} aria-hidden="true" />
            </summary>
            <div className="grid grid-cols-1 gap-8 border-t border-line p-4 sm:p-5 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-fg">How posts went out</h3>
                <BarList
                  title="How posts went out"
                  rows={methodRows}
                  barClassName="bg-success"
                  empty={<p className="text-sm text-fg-muted">Nothing published in this range.</p>}
                />
              </div>
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-fg">Runs per repository</h3>
                <BarList
                  title="Runs per repository"
                  rows={repoRows}
                  barClassName="bg-fg/40"
                  empty={<p className="text-sm text-fg-muted">No runs in this range.</p>}
                />
              </div>
              <p className="text-sm text-fg-muted lg:col-span-2">
                {pluralize(totals.drafted, 'draft')} written, {totals.approved} approved and {totals.failed} failed in the
                last {days} days.
              </p>
            </div>
          </details>
        </div>
      )}
    </AppShell>
  )
}
