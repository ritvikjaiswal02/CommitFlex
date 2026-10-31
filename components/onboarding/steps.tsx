'use client'

import * as React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Briefcase,
  Building2,
  Check,
  Code,
  GitFork,
  GraduationCap,
  Lock,
  Megaphone,
  Rocket,
  Store,
  TrendingUp,
  UserSearch,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChoiceGroup } from '@/components/ui/choice-group'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { PlatformIcon } from '@/components/brand/platform'
import type { PlanStatus, PlanId } from '@/lib/billing/catalog'
import { planHasFeature } from '@/lib/billing/catalog'
import type { AutopilotCadence, ApprovalMode, LinkedInConnectionSummary } from '@/types/autopilot'
import type { PostPlatform } from '@/types/posts'
import {
  APPROVAL_OPTIONS,
  AUDIENCE_OPTIONS,
  CADENCE_OPTIONS,
  EXAMPLE_COMMIT,
  MAX_AUDIENCES,
  PITCH_MAX,
  PLATFORM_OPTIONS,
  POST_TIME_OPTIONS,
  ROLE_OPTIONS,
  TONE_OPTIONS,
  VOICE_SAMPLES_MAX,
  VOICE_SAMPLE_MIN,
  checkVoiceSamples,
  timeZoneAbbreviation,
  type Audience,
  type PostTime,
  type Role,
  type TonePreset,
} from './questions'
import { TimezoneSelect } from './timezone-select'

const ROLE_ICONS: Record<Role, LucideIcon> = {
  founder: Rocket,
  engineer: Building2,
  maintainer: GitFork,
  freelancer: Briefcase,
  student: GraduationCap,
  devrel: Megaphone,
}

const AUDIENCE_ICONS: Record<Audience, LucideIcon> = {
  developers: Code,
  recruiters: UserSearch,
  customers: Store,
  founders: TrendingUp,
  users: Users,
}

function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="text-sm text-danger">
      {children}
    </p>
  )
}

/* ─── Role ───────────────────────────────────────────────────────────── */

export function RoleStep({
  role,
  pitch,
  onRole,
  onPitch,
  error,
  labelledBy,
}: {
  role: Role | null
  pitch: string
  onRole: (r: Role) => void
  onPitch: (p: string) => void
  error: string | null
  labelledBy: string
}) {
  const options = ROLE_OPTIONS.map((o) => ({ ...o, icon: ROLE_ICONS[o.value] }))
  const remaining = PITCH_MAX - pitch.length
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <ChoiceGroup<Role>
          aria-label="What best describes you?"
          aria-describedby={error ? `${labelledBy}-error` : undefined}
          value={role ?? ([] as Role[])}
          onChange={(v) => onRole(v as Role)}
          options={options}
          columns={2}
        />
        {error && <FieldError id={`${labelledBy}-error`}>{error}</FieldError>}
      </div>
      <Field
        label="In one line, what are you building?"
        description="Optional. We pass it to the writer so posts can mention it naturally."
      >
        <Input
          value={pitch}
          maxLength={PITCH_MAX}
          onChange={(e) => onPitch(e.target.value)}
          placeholder="An open-source feature flag service for small teams"
          autoComplete="off"
          trailing={
            <span className={cn('pr-1.5 text-xs tabular-nums', remaining < 20 ? 'text-warning' : 'text-fg-subtle')}>
              {remaining}
            </span>
          }
        />
      </Field>
    </div>
  )
}

/* ─── Audience ───────────────────────────────────────────────────────── */

export function AudienceStep({
  audiences,
  onChange,
  error,
  labelledBy,
}: {
  audiences: Audience[]
  onChange: (a: Audience[]) => void
  error: string | null
  labelledBy: string
}) {
  const options = AUDIENCE_OPTIONS.map((o) => ({ ...o, icon: AUDIENCE_ICONS[o.value] }))
  return (
    <div className="flex flex-col gap-3">
      <ChoiceGroup<Audience>
        aria-label="Who should your posts reach?"
        aria-describedby={error ? `${labelledBy}-error` : `${labelledBy}-count`}
        multiple
        max={MAX_AUDIENCES}
        value={audiences}
        onChange={(v) => onChange(v as Audience[])}
        options={options}
        columns={2}
      />
      <p id={`${labelledBy}-count`} className="text-sm text-fg-muted tabular-nums" aria-live="polite">
        {audiences.length} of {MAX_AUDIENCES} selected
      </p>
      {error && <FieldError id={`${labelledBy}-error`}>{error}</FieldError>}
    </div>
  )
}

/* ─── Platforms ──────────────────────────────────────────────────────── */

export function PlatformsStep({
  platforms,
  onChange,
  linkedin,
  linkedinAvailable,
  connectHref,
  onBeforeConnect,
  error,
  labelledBy,
}: {
  platforms: PostPlatform[]
  onChange: (p: PostPlatform[]) => void
  linkedin: LinkedInConnectionSummary | null
  linkedinAvailable: boolean
  connectHref: string
  /** Saves progress before leaving for LinkedIn's consent screen. */
  onBeforeConnect: () => Promise<void>
  error: string | null
  labelledBy: string
}) {
  const [connecting, setConnecting] = React.useState(false)
  const toggle = (p: PostPlatform) =>
    onChange(platforms.includes(p) ? platforms.filter((x) => x !== p) : [...platforms, p])

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Where do you want to post?" className="flex flex-col gap-3">
        {PLATFORM_OPTIONS.map((option) => {
          const checked = platforms.includes(option.value)
          const isLinkedIn = option.value === 'linkedin'
          const connected = isLinkedIn && linkedin?.status === 'active'
          const expired = isLinkedIn && linkedin && linkedin.status !== 'active'
          return (
            <div
              key={option.value}
              className={cn(
                'overflow-hidden rounded-lg border bg-surface transition-[border-color,box-shadow] duration-120',
                checked ? 'border-accent shadow-[inset_0_0_0_1px_rgb(var(--c-accent))]' : 'border-line hover:border-line-strong',
              )}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggle(option.value)}
                className="flex w-full items-start gap-3 p-4 text-left focus-ring-inset"
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-md',
                    checked ? 'bg-accent-soft/60' : 'bg-sunken',
                  )}
                >
                  <PlatformIcon platform={option.value} className="size-[18px]" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-base font-medium text-fg">{option.label}</span>
                  <span className="text-sm text-fg-muted">{option.description}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-1 flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors duration-120',
                    checked ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong bg-surface',
                  )}
                >
                  {checked && <Check className="size-3" strokeWidth={2.5} />}
                </span>
              </button>

              {isLinkedIn && checked && (
                <div className="flex flex-col gap-2 border-t border-line bg-sunken/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  {connected ? (
                    <p className="inline-flex items-center gap-2 text-sm text-fg">
                      <Check className="size-4 text-success" strokeWidth={2} aria-hidden="true" />
                      Connected as {linkedin?.displayName ?? 'your LinkedIn account'}
                    </p>
                  ) : linkedinAvailable ? (
                    <>
                      <p className="text-sm text-fg-muted">
                        {expired
                          ? 'Your LinkedIn connection expired. Reconnect so approved posts publish directly.'
                          : 'Optional. Without it, approved posts open in LinkedIn’s composer for you to post.'}
                      </p>
                      <ButtonLink
                        href={connectHref}
                        variant="secondary"
                        size="sm"
                        className="self-start sm:self-auto"
                        aria-busy={connecting || undefined}
                        onClick={async (e) => {
                          // Save the platform choice first so the return trip resumes here.
                          e.preventDefault()
                          if (connecting) return
                          setConnecting(true)
                          try {
                            await onBeforeConnect()
                          } finally {
                            window.location.assign(connectHref)
                          }
                        }}
                      >
                        <PlatformIcon platform="linkedin" className="size-3.5" />
                        {expired ? 'Reconnect LinkedIn' : 'Connect LinkedIn'}
                      </ButtonLink>
                    </>
                  ) : (
                    <p className="text-sm text-fg-muted">
                      Not available yet. Approved posts open in LinkedIn’s composer, ready to post.
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {error && <FieldError id={`${labelledBy}-error`}>{error}</FieldError>}
    </div>
  )
}

/* ─── Voice ──────────────────────────────────────────────────────────── */

function ExampleCard({ tone }: { tone: TonePreset }) {
  const reduce = useReducedMotion()
  const option = TONE_OPTIONS.find((o) => o.value === tone) ?? TONE_OPTIONS[0]
  return (
    <figure className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface" aria-live="polite">
      <div className="border-b border-line bg-sunken/60 px-4 py-3">
        <figcaption className="text-xs text-fg-muted">From this commit</figcaption>
        <p className="mt-1 font-mono text-sm text-fg">
          <span className="marker box-decoration-clone">{EXAMPLE_COMMIT}</span>
        </p>
      </div>
      <div className="px-4 py-4">
        <p className="mb-2 text-xs text-fg-muted">Written as {option.label.toLowerCase()}</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={option.value}
            initial={{ opacity: 0, y: reduce ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -4 }}
            transition={{ duration: reduce ? 0.1 : 0.18, ease: [0.2, 0, 0, 1] }}
            className="flex flex-col gap-3 text-base text-fg"
          >
            {option.example.split('\n\n').map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </figure>
  )
}

export function VoiceStep({
  tone,
  onTone,
  samplesText,
  onSamplesText,
  samplesError,
}: {
  tone: TonePreset
  onTone: (t: TonePreset) => void
  samplesText: string
  onSamplesText: (s: string) => void
  samplesError: string | null
}) {
  const check = checkVoiceSamples(samplesText)
  const count = check.samples.length
  let status: string
  if (count === 0) status = 'Optional. Skip it and we’ll write from the tone above.'
  else if (check.tooMany) status = `${count} posts found. Paste at most ${VOICE_SAMPLES_MAX}.`
  else if (check.tooShort > 0)
    status = `${count} ${count === 1 ? 'post' : 'posts'} found. ${check.tooShort} ${check.tooShort === 1 ? 'is' : 'are'} shorter than ${VOICE_SAMPLE_MIN} characters.`
  else if (check.tooLong > 0) status = `${check.tooLong} ${check.tooLong === 1 ? 'post is' : 'posts are'} over 5,000 characters.`
  else status = `${count} ${count === 1 ? 'post' : 'posts'} found. We keep a short style summary, not the posts.`

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <ChoiceGroup<TonePreset>
          aria-label="How should your posts sound?"
          value={tone}
          onChange={(v) => onTone(v as TonePreset)}
          options={TONE_OPTIONS.map(({ value, label, description }) => ({ value, label, description }))}
          columns={1}
        />
        <div className="lg:sticky lg:top-6">
          <ExampleCard tone={tone} />
        </div>
      </div>

      <Field
        label="Paste two or three posts you’ve written before"
        description="We’ll match your sentence length, structure and quirks. Separate posts with a blank line."
        error={samplesError}
      >
        <Textarea
          value={samplesText}
          onChange={(e) => onSamplesText(e.target.value)}
          rows={7}
          autoResize
          placeholder={'Paste a post here.\n\nLeave a blank line, then paste the next one.'}
          className="min-h-[168px]"
        />
      </Field>
      <p
        className={cn('-mt-6 text-sm', check.valid ? 'text-fg-muted' : 'text-warning')}
        aria-live="polite"
      >
        {status}
      </p>
    </div>
  )
}

/* ─── Cadence ────────────────────────────────────────────────────────── */

function LockedBadge() {
  return (
    <Badge variant="neutral" size="sm" className="gap-1">
      <Lock className="size-3" strokeWidth={2} aria-hidden="true" />
      Pro
    </Badge>
  )
}

export function CadenceStep({
  cadence,
  onCadence,
  postTime,
  onPostTime,
  timezone,
  onTimezone,
  approvalMode,
  onApprovalMode,
  plan,
  onLocked,
}: {
  cadence: AutopilotCadence
  onCadence: (c: AutopilotCadence) => void
  postTime: PostTime
  onPostTime: (t: PostTime) => void
  timezone: string
  onTimezone: (tz: string) => void
  approvalMode: ApprovalMode
  onApprovalMode: (m: ApprovalMode) => void
  plan: { id: PlanId; status: PlanStatus }
  onLocked: (feature: 'autopilot.cadence' | 'publish.auto_approve') => void
}) {
  const [changingTz, setChangingTz] = React.useState(false)
  const tzSelectId = React.useId()
  const cadenceAllowed = planHasFeature(plan.id, 'autopilot.cadence')
  const autoAllowed = planHasFeature(plan.id, 'publish.auto_approve')
  const trialing = plan.status === 'trialing'

  const cadenceOptions = CADENCE_OPTIONS.map((o) => ({
    ...o,
    badge: o.value !== 'ship_moments' && !cadenceAllowed ? <LockedBadge /> : undefined,
  }))
  const approvalOptions = APPROVAL_OPTIONS.map((o) => ({
    ...o,
    badge:
      o.value === 'auto' ? (
        !autoAllowed ? (
          <LockedBadge />
        ) : trialing ? (
          <Badge variant="accent" size="sm">
            Pro, included in your trial
          </Badge>
        ) : undefined
      ) : undefined,
  }))

  return (
    <div className="flex flex-col gap-10">
      <ChoiceGroup<AutopilotCadence>
        aria-label="How often should CommitFlex post for you?"
        value={cadence}
        onChange={(v) => {
          const next = v as AutopilotCadence
          if (next !== 'ship_moments' && !cadenceAllowed) return onLocked('autopilot.cadence')
          onCadence(next)
        }}
        options={cadenceOptions}
        columns={1}
      />

      <section aria-labelledby="cadence-time" className="flex flex-col gap-3">
        <h2 id="cadence-time" className="text-lg font-semibold text-fg">
          What time works best?
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <SegmentedControl<PostTime>
            aria-label="Posting time"
            value={postTime}
            onValueChange={onPostTime}
            options={POST_TIME_OPTIONS}
            className="w-full sm:w-auto"
          />
          <p className="text-sm text-fg-muted">
            in {timezone.replace(/_/g, ' ')} ({timeZoneAbbreviation(timezone)}){' '}
            <button
              type="button"
              onClick={() => setChangingTz((v) => !v)}
              aria-expanded={changingTz}
              aria-controls={tzSelectId}
              className="rounded-sm font-medium text-accent underline-offset-4 hover:underline focus-ring"
            >
              {changingTz ? 'Done' : 'Change'}
            </button>
          </p>
        </div>
        {changingTz && (
          <TimezoneSelect
            id={tzSelectId}
            value={timezone}
            onChange={onTimezone}
            aria-label="Time zone"
            className="max-w-sm"
          />
        )}
      </section>

      <section aria-labelledby="cadence-approval" className="flex flex-col gap-3">
        <h2 id="cadence-approval" className="text-lg font-semibold text-fg">
          Before anything goes out…
        </h2>
        <ChoiceGroup<ApprovalMode>
          aria-label="Before anything goes out"
          value={approvalMode}
          onChange={(v) => {
            const next = v as ApprovalMode
            if (next === 'auto' && !autoAllowed) return onLocked('publish.auto_approve')
            onApprovalMode(next)
          }}
          options={approvalOptions}
          columns={1}
        />
      </section>
    </div>
  )
}
