import * as React from 'react'
import Link from 'next/link'
import {
  ArrowUpRight,
  Check,
  GitCommitHorizontal,
  GitMerge,
  Lock,
  Settings2,
  Tag,
} from 'lucide-react'
import type { AutopilotSettings, ShipEventView } from '@/types/autopilot'
import type { PlanId, PlanStatus, UsageSnapshot } from '@/lib/plans'
import { LIMIT_LABELS, planHasFeature } from '@/lib/billing/catalog'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { PlanBadge } from '@/components/billing/plan-badge'
import { UsageMeter } from '@/components/billing/usage-meter'
import { CADENCE_SHORT, computeNextSlots, describeCadence } from '@/components/app/slots'
import { capitalize, formatDayTime, formatWhen, timeZoneAbbr } from '@/components/app/format'

/** Side panels of the Today dashboard. Server components. */

export function Panel({
  title,
  action,
  children,
  className,
  labelledBy,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  labelledBy: string
}) {
  return (
    <section aria-labelledby={labelledBy} className={cn('rounded-lg border border-line bg-surface', className)}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <h2 id={labelledBy} className="text-base font-semibold text-fg">
          {title}
        </h2>
        {action}
      </div>
      <div className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5">{children}</div>
    </section>
  )
}

export function PanelError({ title, labelledBy, message }: { title: string; labelledBy: string; message: string }) {
  return (
    <Panel title={title} labelledBy={labelledBy}>
      <p className="text-sm text-fg-muted">{message}</p>
    </Panel>
  )
}

const TRIGGER_ROWS: { key: 'pr_merged' | 'release_published' | 'weekly_digest'; label: string; feature: 'autopilot.ship_moments' | 'autopilot.weekly_digest' }[] = [
  { key: 'pr_merged', label: 'Merged pull requests', feature: 'autopilot.ship_moments' },
  { key: 'release_published', label: 'Published releases', feature: 'autopilot.ship_moments' },
  { key: 'weekly_digest', label: 'Weekly digest on Mondays', feature: 'autopilot.weekly_digest' },
]

export function AutopilotPanel({
  settings,
  planId,
  timezone,
  now = new Date(),
}: {
  settings: AutopilotSettings
  planId: PlanId
  timezone: string
  now?: Date
}) {
  const paused = settings.pausedUntil && new Date(settings.pausedUntil).getTime() > now.getTime()
  const state = !settings.enabled ? 'off' : paused ? 'paused' : 'on'
  const cadenceLocked = settings.cadence !== 'ship_moments' && !planHasFeature(planId, 'autopilot.cadence')
  const slots = state === 'on' ? computeNextSlots({ ...settings, timezone }, now, 3) : []

  return (
    <Panel
      title="Autopilot"
      labelledBy="panel-autopilot"
      action={
        <Badge variant={state === 'on' ? 'success' : state === 'paused' ? 'warning' : 'neutral'}>
          {state === 'on' ? 'On' : state === 'paused' ? 'Paused' : 'Off'}
        </Badge>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-fg">{describeCadence(settings)}</p>
          <p className="text-sm text-fg-muted">
            {settings.approvalMode === 'auto'
              ? 'Posts go out on their own and you get a summary.'
              : 'You approve each draft before it goes out.'}
          </p>
          {state === 'paused' && settings.pausedUntil && (
            <p className="text-sm text-warning">Paused until {formatDayTime(settings.pausedUntil, timezone, now)}.</p>
          )}
          {state === 'off' && (
            <p className="text-sm text-fg-muted">
              CommitFlex only drafts when you ask. Turn it on to get drafts from merged pull requests, releases and a
              weekly digest.
            </p>
          )}
          {cadenceLocked && (
            <p className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
              <Lock className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              {CADENCE_SHORT[settings.cadence]} needs Pro. Only ship moments and the weekly digest run.
            </p>
          )}
        </div>

        <ul className="flex flex-col gap-2" aria-label="What triggers drafts">
          {TRIGGER_ROWS.map((row) => {
            const enabled = settings.triggers.includes(row.key)
            const allowed = planHasFeature(planId, row.feature)
            return (
              <li key={row.key} className="flex items-center gap-2 text-sm">
                {allowed ? (
                  <span
                    className={cn(
                      'flex size-4 items-center justify-center rounded-sm',
                      enabled ? 'bg-accent text-accent-fg' : 'border border-line-strong',
                    )}
                    aria-hidden="true"
                  >
                    {enabled && <Check className="size-3" strokeWidth={2.5} />}
                  </span>
                ) : (
                  <Lock className="size-4 text-fg-subtle" strokeWidth={1.75} aria-hidden="true" />
                )}
                <span className={cn(enabled && allowed ? 'text-fg' : 'text-fg-muted')}>{row.label}</span>
                <span className="sr-only">{!allowed ? '(needs Pro)' : enabled ? '(on)' : '(off)'}</span>
                {!allowed && <Badge variant="accent" className="ml-auto">Pro</Badge>}
              </li>
            )
          })}
        </ul>

        {slots.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-line pt-3">
            <span className="text-xs text-fg-subtle">Next slots ({timeZoneAbbr(timezone, now)})</span>
            <ul className="flex flex-col gap-1">
              {slots.map((slot) => (
                <li key={slot.toISOString()} className="text-sm tabular-nums text-fg">
                  {capitalize(formatWhen(slot, timezone, now))}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {state === 'off' ? (
            <ButtonLink href="/settings?tab=autopilot" size="sm">
              Turn on autopilot
            </ButtonLink>
          ) : (
            <ButtonLink href="/settings?tab=autopilot" variant="ghost" size="sm">
              <Settings2 strokeWidth={1.75} aria-hidden="true" />
              Settings
            </ButtonLink>
          )}
        </div>
      </div>
    </Panel>
  )
}

export function UsagePanel({
  usage,
  planId,
  planStatus,
  trialEndsAt,
  now = new Date(),
}: {
  usage: UsageSnapshot
  planId: PlanId
  planStatus: PlanStatus
  trialEndsAt: string | null
  now?: Date
}) {
  const daysLeft =
    planStatus === 'trialing' && trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / 86_400_000))
      : null
  const keys = ['generationsPerMonth', 'queuedPosts', 'repos'] as const
  return (
    <Panel
      title="Plan and usage"
      labelledBy="panel-usage"
      action={<PlanBadge plan={planId} status={planStatus} />}
    >
      <div className="flex flex-col gap-4">
        {daysLeft !== null && (
          <p className="text-sm text-fg-muted">
            {daysLeft === 0 ? 'Your Pro trial ends today.' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left in your Pro trial.`}
          </p>
        )}
        {keys.map((key) => (
          <UsageMeter
            key={key}
            label={LIMIT_LABELS[key].label}
            unit={LIMIT_LABELS[key].unit}
            used={usage.items[key].used}
            max={usage.items[key].max}
            showUpgrade={planId !== 'team'}
          />
        ))}
        <ButtonLink href="/billing" variant="secondary" size="sm" className="self-start">
          {planId === 'free' || planStatus === 'trialing' ? 'See plans' : 'Manage billing'}
        </ButtonLink>
      </div>
    </Panel>
  )
}

export interface ChecklistStep {
  key: string
  label: string
  description: string
  done: boolean
  href: string
  cta: string
}

export function SetupChecklist({ steps }: { steps: ChecklistStep[] }) {
  const done = steps.filter((s) => s.done).length
  if (steps.length === 0 || done === steps.length) return null
  const next = steps.find((s) => !s.done)
  return (
    <Panel
      title="Finish setting up"
      labelledBy="panel-setup"
      action={<span className="text-xs tabular-nums text-fg-muted">{done} of {steps.length}</span>}
    >
      <Progress value={done} max={steps.length} aria-label="Setup progress" className="mb-4" />
      <ol className="flex flex-col gap-3">
        {steps.map((step) => (
          <li key={step.key} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
                step.done ? 'bg-success text-success-fg' : 'border border-line-strong bg-surface',
              )}
            >
              {step.done && <Check className="size-2.5" strokeWidth={3} />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn('text-sm font-medium', step.done ? 'text-fg-muted line-through decoration-line-strong' : 'text-fg')}>
                {step.label}
                <span className="sr-only">{step.done ? ' (done)' : ' (to do)'}</span>
              </span>
              {!step.done && <span className="text-sm text-fg-muted">{step.description}</span>}
              {!step.done && step.key === next?.key && (
                <ButtonLink href={step.href} size="sm" variant="secondary" className="mt-1.5 self-start" prefetch={false}>
                  {step.cta}
                </ButtonLink>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

const SHIP_ICON = { pr_merged: GitMerge, release_published: Tag, push: GitCommitHorizontal } as const

const SKIP_REASONS: Record<string, string> = {
  limit_reached: "Skipped: this month's drafts are used up",
  autopilot_off: 'Skipped: autopilot was off',
  plan: 'Skipped: needs Pro',
  bot: 'Skipped: opened by a bot',
  too_small: 'Skipped: too small to post about',
  filtered: 'Skipped: looks like maintenance',
}

export function ShipMomentsPanel({ events, timezone, now = new Date() }: { events: ShipEventView[]; timezone: string; now?: Date }) {
  return (
    <Panel title="Recent ship moments" labelledBy="panel-ships">
      {events.length === 0 ? (
        <p className="text-sm text-fg-muted">
          Merged pull requests and releases from your repositories show up here as CommitFlex picks them up.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((event) => {
            const Icon = SHIP_ICON[event.kind] ?? GitCommitHorizontal
            const skipped = event.skippedReason ? SKIP_REASONS[event.skippedReason] ?? `Skipped: ${event.skippedReason.replace(/_/g, ' ')}` : null
            return (
              <li key={event.id} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {event.jobId ? (
                    <Link
                      href={`/jobs/${event.jobId}`}
                      className="truncate rounded-sm text-sm text-fg hover:text-accent hover:underline focus-ring-surface"
                    >
                      {event.title}
                    </Link>
                  ) : event.url ? (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 truncate rounded-sm text-sm text-fg hover:underline focus-ring-surface"
                    >
                      <span className="truncate">{event.title}</span>
                      <ArrowUpRight className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="truncate text-sm text-fg">{event.title}</span>
                  )}
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
                    <span className="font-mono">{event.repoFullName}</span>
                    <span>{formatWhen(event.createdAt, timezone, now)}</span>
                  </span>
                  {skipped && <span className="text-xs text-fg-muted">{skipped}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
