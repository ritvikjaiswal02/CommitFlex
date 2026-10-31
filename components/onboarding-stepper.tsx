'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import { toast } from '@/components/ui/toast'
import { Logo } from '@/components/brand/logo'
import { platformLabel } from '@/components/brand/platform'
import { UpgradeProvider, useUpgrade } from '@/components/billing/upgrade-provider'
import { limitFor } from '@/lib/billing/catalog'
import type { AutopilotCadence, ApprovalMode } from '@/types/autopilot'
import type { PostPlatform } from '@/types/posts'
import {
  AUDIENCE_OPTIONS,
  CADENCE_OPTIONS,
  POST_TIME_VALUES,
  ROLE_OPTIONS,
  STEP_LABELS,
  TONE_OPTIONS,
  checkVoiceSamples,
  isAudience,
  isRole,
  isTonePreset,
  type Audience,
  type OnboardingStep,
  type PostTime,
  type Role,
  type TonePreset,
} from '@/components/onboarding/questions'
import {
  browserTimeZone,
  patchJson,
  readError,
  safeStorage,
  type CompleteResponse,
  type GithubRepoOption,
  type OnboardingState,
} from '@/components/onboarding/client'
import { OnboardingRail, OnboardingTopBar } from '@/components/onboarding/onboarding-rail'
import { StepHeader } from '@/components/onboarding/step-header'
import { RepoPicker } from '@/components/onboarding/repo-picker'
import { AudienceStep, CadenceStep, PlatformsStep, RoleStep, VoiceStep } from '@/components/onboarding/steps'
import { OnboardingSuccess } from '@/components/onboarding/onboarding-success'
import { connectRepo, useGithubRepos } from '@/components/onboarding/use-github-repos'

type QuestionStep = Exclude<OnboardingStep, 'done'>
const STEPS: QuestionStep[] = ['repos', 'role', 'audience', 'platforms', 'voice', 'cadence']
const SAMPLES_KEY = 'cf:onboarding:voice-samples'
const FIRST_REPO_KEY = 'cf:onboarding:first-repo'

export type LinkedInReturn = 'connected' | 'denied' | 'error' | null

export interface OnboardingUser {
  name?: string | null
  image?: string | null
  email?: string | null
  login?: string | null
}

interface Answers {
  role: Role | null
  pitch: string
  audiences: Audience[]
  platforms: PostPlatform[]
  tonePreset: TonePreset
  samplesText: string
  cadence: AutopilotCadence
  postTime: PostTime
  approvalMode: ApprovalMode
  timezone: string
  /** Approval emails go here when the GitHub email is missing or private. */
  notifyEmail: string
}

/** "Use recommended settings": sensible defaults, all editable later in Settings. */
const RECOMMENDED: Pick<Answers, 'role' | 'audiences' | 'platforms' | 'tonePreset' | 'cadence' | 'postTime' | 'approvalMode'> = {
  role: 'engineer',
  audiences: ['developers'],
  platforms: ['linkedin', 'twitter'],
  tonePreset: 'plain_technical',
  cadence: 'ship_moments',
  postTime: '09:00',
  approvalMode: 'review',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** GitHub accounts with a private email give us nothing (or a noreply address) to send approvals to. */
function needsNotifyEmail(email: string | null | undefined): boolean {
  return !email || /@users\.noreply\.github\.com$/i.test(email)
}

function initialAnswers(state: OnboardingState): Answers {
  const p = state.profile
  const a = state.autopilot
  const platforms = (p.platforms ?? []).filter((x): x is PostPlatform => x === 'linkedin' || x === 'twitter')
  return {
    role: isRole(p.role) ? p.role : null,
    pitch: p.pitch ?? '',
    audiences: (p.audiences ?? []).filter(isAudience).slice(0, 2),
    platforms: platforms.length > 0 ? platforms : ['linkedin', 'twitter'],
    tonePreset: isTonePreset(p.tonePreset) ? p.tonePreset : 'plain_technical',
    samplesText: safeStorage.get(SAMPLES_KEY) ?? '',
    cadence: a?.cadence ?? 'ship_moments',
    postTime: a && (POST_TIME_VALUES as readonly string[]).includes(a.postTime) ? (a.postTime as PostTime) : '09:00',
    approvalMode: a?.approvalMode ?? 'review',
    timezone: p.timezone || browserTimeZone(),
    notifyEmail: '',
  }
}

function initialStepIndex(state: OnboardingState): number {
  if (state.repos.length === 0) return 0
  if (state.profile.onboardingStep === 'done') return STEPS.length - 1
  const i = STEPS.indexOf(state.profile.onboardingStep as QuestionStep)
  return i === -1 ? 1 : i
}

/* ─── Loading frame ──────────────────────────────────────────────────── */

function LoadingFrame() {
  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-surface p-8 lg:block">
        <Logo />
        <div className="mt-16 flex flex-col gap-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-3.5 w-28" />
            </div>
          ))}
        </div>
      </aside>
      <main className="px-4 py-10 sm:px-6 lg:px-16 lg:py-16" aria-busy="true" aria-label="Loading your setup">
        <div className="mx-auto flex max-w-[680px] flex-col gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-4/5" />
          <Skeleton className="h-5 w-3/5" />
          <div className="mt-6 flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

/* ─── Entry ──────────────────────────────────────────────────────────── */

export interface OnboardingStepperProps {
  user: OnboardingUser
  linkedinReturn?: LinkedInReturn
}

/** Full-screen onboarding: repos, then five questions, then autopilot starts. */
export function OnboardingStepper({ user, linkedinReturn = null }: OnboardingStepperProps) {
  const [state, setState] = React.useState<OnboardingState | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setError(null)
    fetch(`/api/onboarding?tz=${encodeURIComponent(browserTimeZone())}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, 'We couldn’t load your setup. Try again.'))
        return (await res.json()) as OnboardingState
      })
      .then((data) => {
        if (!cancelled) setState(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'We couldn’t load your setup. Try again.')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col bg-canvas">
        <div className="px-4 pt-6 sm:px-8">
          <Logo href="/" />
        </div>
        <main className="mx-auto flex w-full max-w-[560px] flex-1 items-center px-4">
          <ErrorState
            align="center"
            className="w-full"
            title="Setup didn’t load"
            description={error}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </main>
      </div>
    )
  }
  if (!state) return <LoadingFrame />

  return (
    <UpgradeProvider currentPlan={state.plan.id}>
      <OnboardingFlow initial={state} user={user} linkedinReturn={linkedinReturn} />
    </UpgradeProvider>
  )
}

/* ─── Flow ───────────────────────────────────────────────────────────── */

function OnboardingFlow({
  initial,
  user,
  linkedinReturn,
}: {
  initial: OnboardingState
  user: OnboardingUser
  linkedinReturn: LinkedInReturn
}) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const { openUpgrade, handlePlanError } = useUpgrade()
  const titleId = React.useId()
  const mainRef = React.useRef<HTMLElement>(null)

  const state = initial
  const [answers, setAnswers] = React.useState<Answers>(() => initialAnswers(initial))
  const [stepIndex, setStepIndex] = React.useState(() => initialStepIndex(initial))
  const [furthest, setFurthest] = React.useState(() => initialStepIndex(initial))
  const [direction, setDirection] = React.useState<1 | -1>(1)
  const [busy, setBusy] = React.useState(false)
  const [stepError, setStepError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<CompleteResponse | null>(null)

  // Repos
  const [connectedRepos, setConnectedRepos] = React.useState(initial.repos)
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const [firstRepoId, setFirstRepoId] = React.useState<string | null>(() => safeStorage.get(FIRST_REPO_KEY))
  const github = useGithubRepos(true)

  const step = STEPS[stepIndex]
  const plan = state.plan
  const repoMax = limitFor(plan.id, 'repos')
  const connectedNames = React.useMemo(() => new Set(connectedRepos.map((r) => r.fullName)), [connectedRepos])

  const update = React.useCallback(<K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers((prev) => ({ ...prev, [key]: value }))
    setStepError(null)
  }, [])

  // LinkedIn round trip: confirm, then drop the query param.
  React.useEffect(() => {
    if (!linkedinReturn) return
    if (linkedinReturn === 'connected') {
      toast.success(`Connected as ${initial.linkedin?.displayName ?? 'your LinkedIn account'}`)
    } else if (linkedinReturn === 'denied') {
      toast.info('LinkedIn wasn’t connected', { description: 'You can connect it any time from Settings.' })
    } else {
      toast.error('LinkedIn didn’t connect', {
        description: 'LinkedIn returned an error. Try again, or continue and connect later from Settings.',
      })
    }
    router.replace('/onboarding', { scroll: false })
  }, [linkedinReturn, initial.linkedin, router])

  // Keep pasted samples across refreshes. They're only sent at completion.
  React.useEffect(() => {
    if (answers.samplesText) safeStorage.set(SAMPLES_KEY, answers.samplesText)
    else safeStorage.remove(SAMPLES_KEY)
  }, [answers.samplesText])

  const save = React.useCallback(async (patch: Record<string, unknown>) => {
    try {
      const res = await patchJson('/api/onboarding', patch)
      if (!res.ok) {
        toast.error('Your progress didn’t save', {
          description: await readError(res, 'Your answers stay on this page and are saved when you finish.'),
        })
        return false
      }
      return true
    } catch {
      toast.error('Your progress didn’t save', {
        description: 'Check your connection. Your answers stay on this page and are saved when you finish.',
      })
      return false
    }
  }, [])

  const goTo = React.useCallback(
    (index: number) => {
      setDirection(index >= stepIndex ? 1 : -1)
      setStepIndex(index)
      setFurthest((f) => Math.max(f, index))
      setStepError(null)
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
        window.setTimeout(() => document.getElementById(titleId)?.focus({ preventScroll: true }), reduce ? 0 : 200)
      })
    },
    [stepIndex, reduce, titleId],
  )

  /* Repos step: connect what's new, then remember which repo to draft from first. */
  const continueFromRepos = async (): Promise<boolean> => {
    if (connectedRepos.length + selected.size === 0) {
      setStepError('Pick at least one repo to continue.')
      return false
    }
    const byId = new Map((github.repos ?? []).map((r) => [r.githubRepoId, r]))
    const toConnect = Array.from(selected)
      .map((id) => byId.get(id))
      .filter((r): r is GithubRepoOption => !!r)

    const nowConnected = [...connectedRepos]
    const warnings: string[] = []
    for (const repo of toConnect) {
      const outcome = await connectRepo(repo)
      if (!outcome.ok) {
        setConnectedRepos(nowConnected)
        if (await handlePlanError(outcome.res)) return false
        setStepError(
          await readError(
            outcome.res,
            `We couldn’t connect ${repo.fullName}. Check that you still have access to it, then try again.`,
          ),
        )
        return false
      }
      if (outcome.warning) warnings.push(outcome.warning)
      if (outcome.id && !nowConnected.some((r) => r.fullName === repo.fullName)) {
        nowConnected.push({ id: outcome.id, fullName: repo.fullName })
      }
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(repo.githubRepoId)
        return next
      })
    }
    setConnectedRepos(nowConnected)
    if (warnings.length > 0) {
      toast.info('Connected without a webhook', {
        description: `${warnings[0]} Install it later from Repositories so merged pull requests reach us.`,
      })
    }

    // Draft first from the most recently active repo.
    const activity = (fullName: string) => {
      const gh = github.repos?.find((r) => r.fullName === fullName)
      const iso = gh?.pushedAt ?? gh?.updatedAt
      return iso ? new Date(iso).getTime() : 0
    }
    const newest = [...nowConnected].sort((a, b) => activity(b.fullName) - activity(a.fullName))[0]
    if (newest) {
      setFirstRepoId(newest.id)
      safeStorage.set(FIRST_REPO_KEY, newest.id)
      // Start reading and summarising the last two weeks now, while the user
      // answers the questions. Best effort: /complete falls back to a full run.
      void fetch('/api/onboarding/prefetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId: newest.id }),
      }).catch(() => undefined)
    }
    return true
  }

  const askNotifyEmail = answers.approvalMode === 'review' && needsNotifyEmail(user.email)

  const validate = (): string | null => {
    switch (step) {
      case 'role':
        return answers.role ? null : 'Pick the option closest to you to continue.'
      case 'audience':
        return answers.audiences.length > 0 ? null : 'Pick at least one audience to continue.'
      case 'platforms':
        return answers.platforms.length > 0 ? null : 'Pick at least one platform to continue.'
      case 'voice': {
        const check = checkVoiceSamples(answers.samplesText)
        if (check.valid) return null
        if (check.tooMany) return 'Paste at most 10 posts, or clear the box to skip.'
        if (check.tooShort > 0) return 'Each post needs at least 40 characters. Remove the short ones or clear the box to skip.'
        return 'Each post can be at most 5,000 characters.'
      }
      case 'cadence':
        if (askNotifyEmail && !EMAIL_RE.test(answers.notifyEmail.trim())) {
          return 'Enter the email address where approval requests should go.'
        }
        return null
      default:
        return null
    }
  }

  const patchForStep = (s: QuestionStep): Record<string, unknown> => {
    switch (s) {
      case 'role':
        return { ...(answers.role ? { role: answers.role } : {}), pitch: answers.pitch.trim() }
      case 'audience':
        return { audiences: answers.audiences }
      case 'platforms':
        return answers.platforms.length > 0 ? { platforms: answers.platforms } : {}
      case 'voice':
        return { tonePreset: answers.tonePreset }
      case 'cadence':
        return {
          cadence: answers.cadence,
          postTime: answers.postTime,
          approvalMode: answers.approvalMode,
          timezone: answers.timezone,
        }
      default:
        return {}
    }
  }

  const complete = async (overrides: Partial<Answers> = {}, repoId: string | null = firstRepoId) => {
    const final = { ...answers, ...overrides }
    const samples = checkVoiceSamples(final.samplesText).samples
    const notifyEmail = final.notifyEmail.trim()
    const res = await patchJson(
      '/api/onboarding/complete',
      {
        role: final.role,
        pitch: final.pitch.trim() || undefined,
        audiences: final.audiences,
        platforms: final.platforms,
        tonePreset: final.tonePreset,
        voiceSamples: samples,
        cadence: final.cadence,
        postTime: final.postTime,
        approvalMode: final.approvalMode,
        timezone: final.timezone,
        ...(repoId ? { firstRepoId: repoId } : {}),
        ...(notifyEmail && EMAIL_RE.test(notifyEmail) ? { notifyEmail } : {}),
      },
      'POST',
    )
    if (!res.ok) {
      if (await handlePlanError(res)) return
      const body = (await res.clone().json().catch(() => null)) as { code?: string } | null
      if (body?.code === 'no_repos') {
        goTo(0)
        window.setTimeout(() => setStepError('Pick at least one repo to continue.'), 0)
        return
      }
      setStepError(await readError(res, 'We couldn’t start autopilot. Your answers are saved; try again.'))
      return
    }
    const data = (await res.json()) as CompleteResponse
    safeStorage.remove(SAMPLES_KEY)
    safeStorage.remove(FIRST_REPO_KEY)
    setResult(data)
    window.scrollTo({ top: 0 })
  }

  const onContinue = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (busy) return
    setStepError(null)

    const problem = validate()
    if (problem) {
      setStepError(problem)
      return
    }

    setBusy(true)
    try {
      if (step === 'repos') {
        if (!(await continueFromRepos())) return
        void save({ step: STEPS[stepIndex + 1] })
        goTo(stepIndex + 1)
        return
      }
      if (step === 'cadence') {
        await complete()
        return
      }
      void save({ ...patchForStep(step), step: STEPS[stepIndex + 1] })
      goTo(stepIndex + 1)
    } catch {
      setStepError('The request was interrupted. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  /** Five clicks to a first draft: connect repos, accept the defaults. */
  const useRecommended = async () => {
    if (busy) return
    setStepError(null)
    setBusy(true)
    try {
      if (!(await continueFromRepos())) return
      setAnswers((prev) => ({ ...prev, ...RECOMMENDED }))
      await complete(RECOMMENDED, safeStorage.get(FIRST_REPO_KEY) ?? firstRepoId)
    } catch {
      setStepError('The request was interrupted. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const onBack = () => {
    if (stepIndex === 0 || busy) return
    void save({ ...patchForStep(step), step: STEPS[stepIndex - 1] })
    goTo(stepIndex - 1)
  }

  /* Rail summaries for answered steps */
  const summaries: Record<QuestionStep, string | null> = {
    repos:
      connectedRepos.length === 1
        ? (connectedRepos[0].fullName.split('/').pop() ?? null)
        : connectedRepos.length > 1
          ? `${connectedRepos.length} repos`
          : null,
    role: ROLE_OPTIONS.find((o) => o.value === answers.role)?.label ?? null,
    audience:
      answers.audiences
        .map((a) => AUDIENCE_OPTIONS.find((o) => o.value === a)?.label)
        .filter(Boolean)
        .join(', ') || null,
    platforms: answers.platforms.map(platformLabel).join(' and ') || null,
    voice: TONE_OPTIONS.find((o) => o.value === answers.tonePreset)?.label ?? null,
    cadence: CADENCE_OPTIONS.find((o) => o.value === answers.cadence)?.label ?? null,
  }
  const railSteps = STEPS.map((key) => ({ key, label: STEP_LABELS[key], summary: summaries[key] }))
  const total = STEPS.length
  const selectedCount = connectedRepos.length + selected.size
  const showTrialNote = plan.status === 'trialing' && selectedCount > 1
  const linkedinNeedsConnect =
    answers.platforms.includes('linkedin') && state.linkedinAvailable && state.linkedin?.status !== 'active'

  let body: React.ReactNode = null
  switch (step) {
    case 'repos':
      body = (
        <div className="flex flex-col gap-6">
          <StepHeader
            index={stepIndex}
            total={total}
            titleId={titleId}
            title="Which repos should CommitFlex watch?"
            helper="Pick the projects you’d talk about publicly. We’ll add a webhook so merged pull requests and releases reach us automatically."
          />
          <RepoPicker
            repos={github.repos}
            loading={github.loading}
            error={github.error}
            onRetry={github.retry}
            accessUrl={github.accessUrl}
            selected={selected}
            connected={connectedNames}
            max={repoMax}
            onToggle={(id) => {
              setStepError(null)
              setSelected((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }}
            onLimitClick={() =>
              openUpgrade({ code: 'limit_reached', limit: 'repos', used: selectedCount, max: repoMax }, 'pro')
            }
          />
          <div className="flex flex-col gap-3">
            <p className="text-sm text-fg-muted tabular-nums" aria-live="polite">
              {selectedCount} of {repoMax} {repoMax === 1 ? 'repo' : 'repos'} selected.
              {connectedRepos.length > 0 && ' Repos you’ve already connected are managed from Repositories.'}
            </p>
            {showTrialNote && (
              <Callout tone="info" title="Your trial includes 10 repos.">
                On the Free plan we’ll keep watching the first one.
              </Callout>
            )}
            {!needsNotifyEmail(user.email) && (
              <div className="flex flex-col items-start gap-1 border-t border-line pt-4">
                <Button
                  type="button"
                  variant="link"
                  onClick={useRecommended}
                  disabled={busy || selectedCount === 0}
                  className="text-sm"
                >
                  Use recommended settings
                </Button>
                <p className="text-sm text-fg-muted">
                  Skip the questions: plain technical posts for developers on LinkedIn and X, drafted when you ship,
                  sent to you for approval first. Change any of it later in Settings.
                </p>
              </div>
            )}
          </div>
        </div>
      )
      break
    case 'role':
      body = (
        <div className="flex flex-col gap-6">
          <StepHeader index={stepIndex} total={total} titleId={titleId} title="What best describes you?" />
          <RoleStep
            role={answers.role}
            pitch={answers.pitch}
            onRole={(r) => update('role', r)}
            onPitch={(p) => update('pitch', p)}
            error={stepError}
            labelledBy={titleId}
          />
        </div>
      )
      break
    case 'audience':
      body = (
        <div className="flex flex-col gap-6">
          <StepHeader
            index={stepIndex}
            total={total}
            titleId={titleId}
            title="Who should your posts reach?"
            helper="Pick up to two. This changes what we explain and what we skip."
          />
          <AudienceStep
            audiences={answers.audiences}
            onChange={(a) => update('audiences', a)}
            error={stepError}
            labelledBy={titleId}
          />
        </div>
      )
      break
    case 'platforms':
      body = (
        <div className="flex flex-col gap-6">
          <StepHeader index={stepIndex} total={total} titleId={titleId} title="Where do you want to post?" />
          <PlatformsStep
            platforms={answers.platforms}
            onChange={(p) => update('platforms', p)}
            linkedin={state.linkedin}
            linkedinAvailable={state.linkedinAvailable}
            connectHref="/api/integrations/linkedin/connect?returnTo=/onboarding"
            onBeforeConnect={async () => {
              await save({ platforms: answers.platforms.length ? answers.platforms : ['linkedin'], step: 'platforms' })
            }}
            error={stepError}
            labelledBy={titleId}
          />
        </div>
      )
      break
    case 'voice':
      body = (
        <div className="flex flex-col gap-6">
          <StepHeader index={stepIndex} total={total} titleId={titleId} title="How should your posts sound?" />
          <VoiceStep
            tone={answers.tonePreset}
            onTone={(t) => update('tonePreset', t)}
            samplesText={answers.samplesText}
            onSamplesText={(s) => update('samplesText', s)}
            samplesError={stepError}
          />
        </div>
      )
      break
    case 'cadence':
      body = (
        <div className="flex flex-col gap-6">
          <StepHeader index={stepIndex} total={total} titleId={titleId} title="How often should CommitFlex post for you?" />
          <CadenceStep
            cadence={answers.cadence}
            onCadence={(c) => update('cadence', c)}
            postTime={answers.postTime}
            onPostTime={(t) => update('postTime', t)}
            timezone={answers.timezone}
            onTimezone={(tz) => update('timezone', tz)}
            approvalMode={answers.approvalMode}
            onApprovalMode={(m) => update('approvalMode', m)}
            plan={plan}
            onLocked={(feature) => openUpgrade({ code: 'feature_locked', feature }, 'pro')}
          />
          {askNotifyEmail && (
            <Field
              label="Where should we send drafts for approval?"
              description="Your GitHub email is private, so we need an address for the approval emails. We only use it for CommitFlex notifications."
              error={stepError ?? undefined}
            >
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={answers.notifyEmail}
                onChange={(e) => update('notifyEmail', e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
          )}
        </div>
      )
      break
  }

  // Role, audience, platforms and voice render their own error next to the field.
  const footerError = stepError && (step === 'repos' || (step === 'cadence' && !askNotifyEmail)) ? stepError : null
  const wide = step === 'voice'

  if (result) {
    return (
      <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface lg:block">
          <OnboardingRail
            steps={railSteps}
            currentIndex={STEPS.length}
            canVisit={() => false}
            onVisit={() => undefined}
            user={user}
          />
        </aside>
        <div className="flex min-h-dvh flex-col">
          <div className="border-b border-line bg-surface px-4 py-4 sm:px-6 lg:hidden">
            <Logo href="/" />
          </div>
          <main className="flex-1 px-4 py-10 sm:px-6 lg:px-16 lg:py-16">
            <div className="mx-auto max-w-[720px]">
              <OnboardingSuccess
                result={result}
                approvalMode={answers.approvalMode}
                showLinkedInConnect={linkedinNeedsConnect}
              />
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface lg:block">
        <OnboardingRail
          steps={railSteps}
          currentIndex={stepIndex}
          canVisit={(i) => i <= furthest && !busy}
          onVisit={(i) => {
            void save({ ...patchForStep(step), step: STEPS[i] })
            goTo(i)
          }}
          user={user}
        />
      </aside>

      <form onSubmit={onContinue} className="flex min-h-dvh min-w-0 flex-col" noValidate>
        <div className="lg:hidden">
          <OnboardingTopBar steps={railSteps} currentIndex={stepIndex} />
        </div>

        <main ref={mainRef} className="flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-16 lg:py-16">
          <div className={cn('mx-auto', wide ? 'max-w-[920px]' : 'max-w-[680px]')}>
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={step}
                initial={{ opacity: 0, x: reduce ? 0 : direction * 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reduce ? 0 : direction * -12 }}
                transition={{ duration: reduce ? 0.1 : 0.18, ease: [0.2, 0, 0, 1] }}
              >
                {body}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        <footer className="sticky bottom-0 z-[2] border-t border-line bg-surface">
          <div className={cn('mx-auto flex flex-col gap-2 px-4 py-3 sm:px-6 lg:px-16', wide ? 'max-w-[1048px]' : 'max-w-[808px]')}>
            {footerError && (
              <p role="alert" className="text-sm text-danger">
                {footerError}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <Button type="button" variant="ghost" onClick={onBack} disabled={stepIndex === 0 || busy}>
                <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
                Back
              </Button>
              <Button type="submit" size="lg" loading={busy} className="min-w-[148px]">
                {step === 'cadence' ? (
                  busy ? 'Starting autopilot' : 'Start autopilot'
                ) : step === 'repos' && busy ? (
                  'Connecting repos'
                ) : (
                  'Continue'
                )}
              </Button>
            </div>
          </div>
        </footer>
      </form>
    </div>
  )
}
