'use client'

import * as React from 'react'
import { Lock, Pause, Play, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Checkbox } from '@/components/ui/checkbox'
import { ChoiceGroup } from '@/components/ui/choice-group'
import { ErrorState } from '@/components/ui/error-state'
import { Field } from '@/components/ui/field'
import { FormSection } from '@/components/ui/form-section'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Select } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { PlatformIcon } from '@/components/brand/platform'
import { useUpgrade } from '@/components/billing/upgrade-provider'
import { PaywallGate } from '@/components/billing/paywall-gate'
import { limitFor, planHasFeature, type FeatureKey, type PlanId, type PlanStatus } from '@/lib/billing/catalog'
import type { ApprovalMode, AutopilotCadence, AutopilotSettings, AutopilotTrigger } from '@/types/autopilot'
import type { PostPlatform } from '@/types/posts'
import {
  APPROVAL_OPTIONS,
  CADENCE_DAYS,
  CADENCE_OPTIONS,
  PLATFORM_OPTIONS,
  POST_TIME_OPTIONS,
  WEEKDAY_LABELS,
  timeZoneAbbreviation,
} from '@/components/onboarding/questions'
import { patchJson, readError } from '@/components/onboarding/client'
import { SaveBar } from './save-bar'

type Editable = Omit<AutopilotSettings, 'timezone'>

interface LoadedState {
  settings: AutopilotSettings
  nextSlots: string[]
  plan: { id: PlanId; status: PlanStatus }
}

export interface AutopilotFormProps {
  voiceProfiles: { id: string; name: string; isDefault: boolean }[]
}

const TRIGGER_OPTIONS: { value: AutopilotTrigger; label: string; description: string; feature: FeatureKey }[] = [
  {
    value: 'pr_merged',
    label: 'Merged pull requests',
    description: 'Skips bots, dependency bumps, chores and tiny diffs.',
    feature: 'autopilot.ship_moments',
  },
  {
    value: 'release_published',
    label: 'Published releases',
    description: 'Release drafts take the earliest free slot.',
    feature: 'autopilot.ship_moments',
  },
  {
    value: 'weekly_digest',
    label: 'Monday digest',
    description: 'One recap of the week’s meaningful commits, when there are any.',
    feature: 'autopilot.weekly_digest',
  },
]

const PRESET_TIMES = POST_TIME_OPTIONS.map((o) => o.value as string)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function editable(s: AutopilotSettings): Editable {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { timezone, ...rest } = s
  return rest
}

/** Order-insensitive for the array fields, so toggling something off and on again isn't a change. */
function normalise(s: Editable): Record<string, unknown> {
  const sorted = (xs: readonly (string | number)[]) => [...xs].map(String).sort()
  return {
    enabled: s.enabled,
    cadence: s.cadence,
    postDays: sorted(s.postDays),
    postTime: s.postTime,
    triggers: sorted(s.triggers),
    platforms: sorted(s.platforms),
    approvalMode: s.approvalMode,
    reviewerEmails: sorted(s.reviewerEmails),
    defaultVoiceProfileId: s.defaultVoiceProfileId ?? null,
    pausedUntil: s.pausedUntil ?? null,
  }
}

function equal(a: Editable, b: Editable): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b))
}

function formatSlot(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleString()
  }
}

function LockedBadge() {
  return (
    <Badge variant="neutral" size="sm" className="gap-1">
      <Lock className="size-3" strokeWidth={2} aria-hidden="true" />
      Pro
    </Badge>
  )
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-10" aria-busy="true" aria-label="Loading autopilot settings">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function AutopilotForm({ voiceProfiles }: AutopilotFormProps) {
  const { openUpgrade, handlePlanError } = useUpgrade()
  const [loaded, setLoaded] = React.useState<LoadedState | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [values, setValues] = React.useState<Editable | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [reviewerDraft, setReviewerDraft] = React.useState('')
  const [reviewerError, setReviewerError] = React.useState<string | null>(null)
  const [customTime, setCustomTime] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setLoadError(null)
    fetch('/api/autopilot/settings', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, 'Autopilot settings didn’t load. Try again.'))
        return (await res.json()) as LoadedState
      })
      .then((data) => {
        if (cancelled) return
        setLoaded(data)
        setValues(editable(data.settings))
        setCustomTime(!PRESET_TIMES.includes(data.settings.postTime))
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Autopilot settings didn’t load. Try again.')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (loadError) {
    return <ErrorState title="Autopilot settings didn’t load" description={loadError} onRetry={() => setAttempt((n) => n + 1)} />
  }
  if (!loaded || !values) return <FormSkeleton />

  const plan = loaded.plan
  const tz = loaded.settings.timezone
  const saved = editable(loaded.settings)
  const dirty = !equal(values, saved)
  const has = (f: FeatureKey) => planHasFeature(plan.id, f)
  const locked = (f: FeatureKey) => openUpgrade({ code: 'feature_locked', feature: f }, f === 'team.reviewers' ? 'team' : 'pro')
  const pausedUntil = values.pausedUntil ? new Date(values.pausedUntil) : null
  const paused = !!pausedUntil && pausedUntil.getTime() > Date.now()

  const set = <K extends keyof Editable>(key: K, value: Editable[K]) => setValues((v) => (v ? { ...v, [key]: value } : v))

  const toggleTrigger = (t: (typeof TRIGGER_OPTIONS)[number]) => {
    if (!has(t.feature)) return locked(t.feature)
    set('triggers', values.triggers.includes(t.value) ? values.triggers.filter((x) => x !== t.value) : [...values.triggers, t.value])
  }

  const toggleDay = (day: number) => {
    const next = values.postDays.includes(day) ? values.postDays.filter((d) => d !== day) : [...values.postDays, day]
    if (next.length === 0) return
    set('postDays', next.sort((a, b) => a - b))
  }

  const togglePlatform = (p: PostPlatform) => {
    const next = values.platforms.includes(p) ? values.platforms.filter((x) => x !== p) : [...values.platforms, p]
    if (next.length === 0) {
      toast.info('Keep at least one platform', { description: 'Autopilot needs somewhere to post.' })
      return
    }
    set('platforms', next)
  }

  const addReviewer = () => {
    const email = reviewerDraft.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) return setReviewerError('Enter a valid email address.')
    if (values.reviewerEmails.includes(email)) return setReviewerError('That reviewer is already on the list.')
    const max = limitFor(plan.id, 'reviewers')
    if (values.reviewerEmails.length >= max) return setReviewerError(`Your plan includes up to ${max} reviewers.`)
    set('reviewerEmails', [...values.reviewerEmails, email])
    setReviewerDraft('')
    setReviewerError(null)
  }

  const onSave = async () => {
    setSaving(true)
    try {
      const res = await patchJson('/api/autopilot/settings', values, 'PUT')
      if (!res.ok) {
        if (await handlePlanError(res)) return
        toast.error('Autopilot settings not saved', { description: await readError(res, 'Check the settings and try again.') })
        return
      }
      const data = (await res.json()) as { settings: AutopilotSettings; nextSlots: string[] }
      setLoaded({ ...loaded, settings: data.settings, nextSlots: data.nextSlots ?? loaded.nextSlots })
      setValues(editable(data.settings))
      toast.success('Autopilot settings saved')
    } catch {
      toast.error('Autopilot settings not saved', { description: 'Check your connection and try again.' })
    } finally {
      setSaving(false)
    }
  }

  const cadenceOptions = CADENCE_OPTIONS.map((o) => ({
    ...o,
    badge: o.value !== 'ship_moments' && !has('autopilot.cadence') ? <LockedBadge /> : undefined,
  }))
  const approvalOptions = APPROVAL_OPTIONS.map((o) => ({
    ...o,
    label: o.value === 'review' ? 'Email me each draft to approve' : o.label,
    badge: o.value === 'auto' && !has('publish.auto_approve') ? <LockedBadge /> : undefined,
  }))
  const timeValue = customTime ? 'custom' : values.postTime

  return (
    <div>
      <FormSection
        title="Autopilot"
        description="When it’s off, nothing is drafted or posted on its own. Drafting by hand still works."
      >
        <div className="flex max-w-xl flex-col gap-4">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-col gap-0.5">
              <label htmlFor="autopilot-enabled" className="text-base font-medium text-fg">
                {values.enabled ? 'Autopilot is on' : 'Autopilot is off'}
              </label>
              <p className="text-sm text-fg-muted">
                {values.enabled
                  ? 'Drafts are written from your ship moments and cadence.'
                  : 'Turn it on to draft from merged pull requests, releases and your cadence.'}
              </p>
            </div>
            <Switch id="autopilot-enabled" checked={values.enabled} onCheckedChange={(v) => set('enabled', v)} />
          </div>
          {values.enabled &&
            (paused ? (
              <Callout
                tone="warning"
                title={`Paused until ${formatSlot(pausedUntil!.toISOString(), tz)}`}
                action={
                  <Button variant="secondary" size="sm" onClick={() => set('pausedUntil', null)}>
                    <Play className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    Resume now
                  </Button>
                }
              >
                Nothing new is drafted or published while paused. Save to apply.
              </Callout>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => set('pausedUntil', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())}
                >
                  <Pause className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  Pause for a week
                </Button>
                <p className="text-sm text-fg-muted">For holidays and quiet weeks.</p>
              </div>
            ))}
        </div>
      </FormSection>
      <Separator />

      <FormSection title="What starts a draft" description="Ship moments are drafted within minutes of happening.">
        <ul className="flex max-w-xl flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {TRIGGER_OPTIONS.map((t) => {
            const allowed = has(t.feature)
            const checked = allowed && values.triggers.includes(t.value)
            const id = `trigger-${t.value}`
            return (
              <li key={t.value} className="flex items-start gap-3 p-4">
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={() => toggleTrigger(t)}
                  aria-describedby={`${id}-desc`}
                  className="mt-0.5"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-fg">
                    {t.label}
                    {!allowed && <LockedBadge />}
                  </label>
                  <p id={`${id}-desc`} className="text-sm text-fg-muted">
                    {t.description}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </FormSection>
      <Separator />

      <FormSection
        title="Cadence"
        description={`Slots are in ${tz.replace(/_/g, ' ')} (${timeZoneAbbreviation(tz)}). Change the zone in Profile.`}
      >
        <div className="flex max-w-xl flex-col gap-6">
          <ChoiceGroup<AutopilotCadence>
            aria-label="How often should CommitFlex post for you?"
            value={values.cadence}
            onChange={(v) => {
              const next = v as AutopilotCadence
              if (next !== 'ship_moments' && !has('autopilot.cadence')) return locked('autopilot.cadence')
              setValues((cur) => (cur ? { ...cur, cadence: next, postDays: CADENCE_DAYS[next] } : cur))
            }}
            options={cadenceOptions}
          />

          {values.cadence !== 'ship_moments' && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium text-fg">Posting days</legend>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_LABELS.map((label, day) => {
                  const on = values.postDays.includes(day)
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(day)}
                      className={cn(
                        'h-9 min-w-[48px] rounded-md border px-2 text-sm font-medium transition-colors duration-120 focus-ring',
                        on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong bg-surface text-fg-muted hover:bg-sunken',
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-fg" id="post-time-label">
              Posting time
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <SegmentedControl<string>
                aria-label="Posting time"
                value={timeValue}
                onValueChange={(v) => {
                  if (v === 'custom') {
                    setCustomTime(true)
                    return
                  }
                  setCustomTime(false)
                  set('postTime', v)
                }}
                options={[...POST_TIME_OPTIONS, { value: 'custom', label: 'Custom' }]}
              />
              {customTime && (
                <Input
                  type="time"
                  step={900}
                  value={values.postTime}
                  onChange={(e) => e.target.value && set('postTime', e.target.value.slice(0, 5))}
                  aria-label="Custom posting time"
                  className="w-32"
                />
              )}
            </div>
          </div>

          {loaded.nextSlots.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-fg">Next slots</p>
              <ul className="flex flex-wrap gap-1.5">
                {loaded.nextSlots.map((slot) => (
                  <li key={slot}>
                    <Badge variant="outline" size="md" className="tabular-nums">
                      {formatSlot(slot, tz)}
                    </Badge>
                  </li>
                ))}
              </ul>
              {dirty && <p className="text-xs text-fg-subtle">Updates after you save.</p>}
            </div>
          )}
        </div>
      </FormSection>
      <Separator />

      <FormSection title="Platforms" description="Autopilot writes one draft per platform for each ship moment.">
        <ul className="flex max-w-xl flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {PLATFORM_OPTIONS.map((p) => {
            const id = `platform-${p.value}`
            return (
              <li key={p.value} className="flex items-start gap-3 p-4">
                <Checkbox
                  id={id}
                  checked={values.platforms.includes(p.value)}
                  onCheckedChange={() => togglePlatform(p.value)}
                  className="mt-0.5"
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <label htmlFor={id} className="inline-flex items-center gap-2 text-sm font-medium text-fg">
                    <PlatformIcon platform={p.value} className="size-4" />
                    {p.label}
                  </label>
                  <p className="text-sm text-fg-muted">{p.description}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </FormSection>
      <Separator />

      <FormSection title="Approval" description="Choose whether drafts wait for you or go out on schedule.">
        <ChoiceGroup<ApprovalMode>
          className="max-w-xl"
          aria-label="Before anything goes out"
          value={values.approvalMode}
          onChange={(v) => {
            const next = v as ApprovalMode
            if (next === 'auto' && !has('publish.auto_approve')) return locked('publish.auto_approve')
            set('approvalMode', next)
          }}
          options={approvalOptions}
        />
      </FormSection>
      <Separator />

      <FormSection
        title="Reviewers"
        description="Teammates who also get approval emails. Any of them can approve a draft."
      >
        <div className="max-w-xl">
          <PaywallGate
            plan={plan.id}
            feature="team.reviewers"
            title="Add reviewers on Team"
            description="Up to five teammates get every draft and can approve it before it goes out."
          >
            <div className="flex flex-col gap-3">
              {values.reviewerEmails.length > 0 && (
                <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
                  {values.reviewerEmails.map((email) => (
                    <li key={email} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="truncate text-sm text-fg">{email}</span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${email}`}
                        onClick={() => set('reviewerEmails', values.reviewerEmails.filter((e) => e !== email))}
                      >
                        <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Field label="Add a reviewer" error={reviewerError} description={`${values.reviewerEmails.length} of ${limitFor(plan.id, 'reviewers')} reviewers`}>
                <Input
                  type="email"
                  value={reviewerDraft}
                  placeholder="teammate@company.com"
                  onChange={(e) => {
                    setReviewerDraft(e.target.value)
                    setReviewerError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addReviewer()
                    }
                  }}
                  trailing={
                    <Button variant="ghost" size="sm" onClick={addReviewer} aria-label="Add reviewer">
                      <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
                      Add
                    </Button>
                  }
                />
              </Field>
            </div>
          </PaywallGate>
        </div>
      </FormSection>
      <Separator />

      <FormSection title="Voice" description="The voice profile autopilot writes with. Manage profiles under Voice.">
        <Field label="Write autopilot drafts as" className="max-w-sm">
          <Select<string>
            value={values.defaultVoiceProfileId ?? 'default'}
            onValueChange={(v) => set('defaultVoiceProfileId', v === 'default' ? null : v)}
            options={[
              { value: 'default', label: 'My default voice profile' },
              ...voiceProfiles.map((p) => ({ value: p.id, label: p.isDefault ? `${p.name} (default)` : p.name })),
            ]}
          />
        </Field>
      </FormSection>

      <SaveBar dirty={dirty} saving={saving} onSave={onSave} onDiscard={() => setValues(saved)} />
    </div>
  )
}
