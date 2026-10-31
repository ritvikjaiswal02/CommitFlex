'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDistanceToNowStrict } from 'date-fns'
import { CalendarRange, Check, GitPullRequest, PenLine, Search, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Select } from '@/components/ui/select'
import { PlatformIcon } from '@/components/brand/platform'
import { useUpgrade } from '@/components/billing/upgrade-provider'
import { cn } from '@/lib/utils'

const LAST_REPO_KEY = 'cf:last-repo-id'
const LAST_MODE_KEY = 'cf:last-mode'

export type GenerateMode = 'window' | 'pr' | 'release'
type RangePreset = '7' | '14' | '30' | 'custom'

export interface GenerateFormRepo {
  id: string
  name: string
  fullName: string
}

export interface GenerateFormVoice {
  id: string
  name: string
  isDefault: boolean
}

export interface GenerateFormProps {
  repos: GenerateFormRepo[]
  voiceProfiles?: GenerateFormVoice[]
  defaultRepoId?: string | null
  defaultMode?: GenerateMode
  defaultPrUrl?: string
  defaultReleaseTag?: string
}

const MODES: { value: GenerateMode; label: string; icon: typeof CalendarRange }[] = [
  { value: 'window', label: 'Date range', icon: CalendarRange },
  { value: 'pr', label: 'Pull request', icon: GitPullRequest },
  { value: 'release', label: 'Release', icon: Tag },
]

const MODE_HINT: Record<GenerateMode, string> = {
  window: 'Writes about the meaningful commits in a time window.',
  pr: 'Writes about one pull request and every commit on it.',
  release: 'Writes about everything between this tag and the one before it.',
}

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: 'custom', label: 'Custom' },
]

function isoDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function presetRange(days: number) {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  return { start: isoDay(start), end: isoDay(end) }
}

/** `https://github.com/o/r/pull/12` or `o/r#12` → `o/r`, else null. */
export function repoFromPrInput(input: string): string | null {
  const trimmed = input.trim()
  const url = /github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/\d+/i.exec(trimmed)
  if (url) return `${url[1]}/${url[2]}`
  const short = /^([\w.-]+)\/([\w.-]+)#\d+$/.exec(trimmed)
  if (short) return `${short[1]}/${short[2]}`
  return null
}

interface ApiError {
  error?: unknown
  code?: string
  jobId?: string
}

function errorMessage(body: ApiError, status: number): string {
  if (typeof body.error === 'string' && body.error) return body.error
  const zod = body.error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> } | undefined
  const first = zod?.formErrors?.[0] ?? Object.values(zod?.fieldErrors ?? {}).flat()[0]
  if (first) return String(first)
  if (status === 429) return 'You started a lot of runs in a short time. Wait a minute and try again.'
  return START_FAILED
}

const START_FAILED = "The drafts didn't start. Check your connection and try again."

export interface ActivityPullRequest {
  number: number
  title: string
  url: string
  mergedAt: string
  additions: number
  deletions: number
  drafted?: boolean
}

export interface ActivityRelease {
  tag: string
  name: string | null
  publishedAt: string | null
  prerelease: boolean
  kind: 'release' | 'tag'
  drafted?: boolean
}

interface RepoActivityState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  pullRequests: ActivityPullRequest[]
  releases: ActivityRelease[]
}

/** Recent merged PRs and releases of a connected repo (GET /api/github/repos/:id/activity). */
function useRepoActivity(repoId: string, enabled: boolean): RepoActivityState & { retry: () => void } {
  const [state, setState] = React.useState<RepoActivityState>({ status: 'idle', pullRequests: [], releases: [] })
  const [attempt, setAttempt] = React.useState(0)
  React.useEffect(() => {
    if (!enabled || !repoId) return
    let cancelled = false
    setState({ status: 'loading', pullRequests: [], releases: [] })
    fetch(`/api/github/repos/${repoId}/activity`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { pullRequests?: ActivityPullRequest[]; releases?: ActivityRelease[] }
        if (!cancelled) {
          setState({
            status: 'ready',
            pullRequests: Array.isArray(data.pullRequests) ? data.pullRequests : [],
            releases: Array.isArray(data.releases) ? data.releases : [],
          })
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', pullRequests: [], releases: [] })
      })
    return () => {
      cancelled = true
    }
  }, [repoId, enabled, attempt])
  const retry = React.useCallback(() => setAttempt((n) => n + 1), [])
  return { ...state, retry }
}

function ago(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : formatDistanceToNowStrict(date, { addSuffix: true })
}

/** '#212 Voice profiles · merged 2 days ago · +480 −31' as parts. */
export function pullRequestMeta(pr: ActivityPullRequest): string {
  const when = ago(pr.mergedAt)
  return [when ? `merged ${when}` : null, `+${pr.additions} \u2212${pr.deletions}`].filter(Boolean).join(' \u00b7 ')
}

/**
 * Starts a manual run: pick a repo and a source (date range, pull request or
 * release) and CommitFlex writes a LinkedIn and an X draft.
 */
export function GenerateForm({
  repos,
  voiceProfiles = [],
  defaultRepoId,
  defaultMode = 'window',
  defaultPrUrl = '',
  defaultReleaseTag = '',
}: GenerateFormProps) {
  const router = useRouter()
  const { handlePlanError } = useUpgrade()
  const initialRepo = defaultRepoId && repos.some((r) => r.id === defaultRepoId) ? defaultRepoId : repos[0]?.id ?? ''

  const [repoId, setRepoId] = React.useState(initialRepo)
  const [mode, setMode] = React.useState<GenerateMode>(defaultPrUrl ? 'pr' : defaultReleaseTag ? 'release' : defaultMode)
  const [preset, setPreset] = React.useState<RangePreset>('7')
  const [range, setRange] = React.useState(() => presetRange(7))
  const [prUrl, setPrUrl] = React.useState(defaultPrUrl)
  const [releaseTag, setReleaseTag] = React.useState(defaultReleaseTag)
  const defaultVoice = voiceProfiles.find((v) => v.isDefault)?.id ?? voiceProfiles[0]?.id ?? ''
  const [voiceId, setVoiceId] = React.useState(defaultVoice)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [activeJobId, setActiveJobId] = React.useState<string | null>(null)
  // Picked from the list (the default) or pasted (fallback).
  const [prPicked, setPrPicked] = React.useState<string | null>(null)
  const [pastePr, setPastePr] = React.useState(!!defaultPrUrl)
  const [prQuery, setPrQuery] = React.useState('')
  const [tagPicked, setTagPicked] = React.useState<string | null>(null)
  const [typeTag, setTypeTag] = React.useState(!!defaultReleaseTag)
  const activity = useRepoActivity(repoId, (mode === 'pr' && !pastePr) || (mode === 'release' && !typeTag))

  // Preselect the newest merged PR without drafts, and the newest release,
  // so the common path is one click on "Write drafts".
  React.useEffect(() => {
    if (activity.status !== 'ready') return
    setPrPicked((current) =>
      current && activity.pullRequests.some((p) => p.url === current)
        ? current
        : (activity.pullRequests.find((p) => !p.drafted) ?? activity.pullRequests[0])?.url ?? null,
    )
    setTagPicked((current) =>
      current && activity.releases.some((r) => r.tag === current) ? current : activity.releases[0]?.tag ?? null,
    )
    if (activity.releases.length === 0) setTypeTag(true)
  }, [activity.status, activity.pullRequests, activity.releases])

  // Restore the last repo and mode, unless the URL asked for something specific.
  React.useEffect(() => {
    try {
      if (!defaultRepoId) {
        const saved = window.localStorage.getItem(LAST_REPO_KEY)
        if (saved && repos.some((r) => r.id === saved)) setRepoId(saved)
      }
      if (!defaultPrUrl && !defaultReleaseTag && defaultMode === 'window') {
        const savedMode = window.localStorage.getItem(LAST_MODE_KEY)
        if (savedMode === 'window' || savedMode === 'pr' || savedMode === 'release') setMode(savedMode)
      }
    } catch {
      // Storage can be unavailable (private windows); the defaults are fine.
    }
  }, [repos, defaultRepoId, defaultPrUrl, defaultReleaseTag, defaultMode])

  const selectRepo = (id: string) => {
    setRepoId(id)
    setPrPicked(null)
    setTagPicked(null)
    try {
      window.localStorage.setItem(LAST_REPO_KEY, id)
    } catch {
      /* ignore */
    }
  }

  const selectMode = (next: GenerateMode) => {
    setMode(next)
    setError(null)
    try {
      window.localStorage.setItem(LAST_MODE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const selectPreset = (next: RangePreset) => {
    setPreset(next)
    if (next !== 'custom') setRange(presetRange(Number(next)))
  }

  const prRepo = mode === 'pr' ? repoFromPrInput(prUrl) : null
  const prRepoMatch = prRepo ? repos.find((r) => r.fullName.toLowerCase() === prRepo.toLowerCase()) : undefined

  // A pasted PR from another connected repo switches the repo for you.
  React.useEffect(() => {
    if (prRepoMatch && prRepoMatch.id !== repoId) setRepoId(prRepoMatch.id)
  }, [prRepoMatch, repoId])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setActiveJobId(null)

    let body: Record<string, unknown>
    if (mode === 'pr' && !pastePr) {
      if (!prPicked) {
        setError('Pick a pull request to write about.')
        return
      }
      body = { source: 'pr', repoId, prUrl: prPicked }
    } else if (mode === 'release' && !typeTag) {
      if (!tagPicked) {
        setError('Pick a release to write about.')
        return
      }
      body = { source: 'release', repoId, releaseTag: tagPicked }
    } else if (mode === 'pr') {
      if (!prUrl.trim()) {
        setError('Pick a pull request to write about.')
        return
      }
      if (prRepo && !prRepoMatch) {
        setError(`${prRepo} isn't connected. Add it in Repositories first.`)
        return
      }
      body = { source: 'pr', repoId, prUrl: prUrl.trim() }
    } else if (mode === 'release') {
      if (!releaseTag.trim()) {
        setError('Pick a release to write about.')
        return
      }
      body = { source: 'release', repoId, releaseTag: releaseTag.trim() }
    } else {
      if (!range.start || !range.end || range.end <= range.start) {
        setError('Pick an end date after the start date.')
        return
      }
      body = { repoId, windowStart: range.start, windowEnd: range.end }
    }
    if (voiceId) body.voiceProfileId = voiceId

    setLoading(true)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 402 && (await handlePlanError(res))) return
      const data = (await res.json().catch(() => ({}))) as ApiError & { jobId?: string }
      if (!res.ok) {
        if (data.code === 'active_job' && data.jobId) {
          setActiveJobId(data.jobId)
          setError('CommitFlex is already writing drafts for this repo.')
          return
        }
        if (data.code === 'no_github_token') {
          setError('Your GitHub connection expired. Sign out and sign in again with GitHub to reconnect it.')
          return
        }
        throw new Error(errorMessage(data, res.status))
      }
      if (!data.jobId) throw new Error(START_FAILED)
      router.push(`/jobs/${data.jobId}`)
    } catch (err) {
      setError(err instanceof Error && err.message && err.message !== 'Failed to fetch' ? err.message : START_FAILED)
    } finally {
      setLoading(false)
    }
  }

  const repoOptions = repos.map((r) => ({ value: r.id, label: r.fullName }))
  const voiceOptions = voiceProfiles.map((v) => ({
    value: v.id,
    label: v.isDefault ? `${v.name} (default)` : v.name,
  }))

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6" aria-busy={loading || undefined}>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Repository">
          <Select
            value={repoId}
            onValueChange={selectRepo}
            options={repoOptions}
            placeholder={repos.length === 0 ? 'No repositories connected' : 'Choose a repository'}
            disabled={repos.length === 0}
            className="font-mono"
          />
        </Field>
        {voiceOptions.length > 0 && (
          <Field label="Voice" description="Which of your voice profiles writes this one.">
            <Select value={voiceId} onValueChange={setVoiceId} options={voiceOptions} />
          </Field>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-fg" id="generate-source-label">
          Write about
        </span>
        <SegmentedControl
          aria-label="Write about"
          value={mode}
          onValueChange={selectMode}
          options={MODES}
          className="self-start"
        />
        <p className="text-sm text-fg-muted">{MODE_HINT[mode]}</p>
      </div>

      {mode === 'window' && (
        <div className="flex flex-col gap-4">
          <SegmentedControl
            aria-label="Time window"
            size="sm"
            value={preset}
            onValueChange={selectPreset}
            options={RANGE_OPTIONS}
            className="self-start"
          />
          {preset === 'custom' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="From">
                <Input
                  type="date"
                  value={range.start}
                  max={range.end || undefined}
                  onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
                />
              </Field>
              <Field label="To">
                <Input
                  type="date"
                  value={range.end}
                  min={range.start || undefined}
                  max={isoDay(new Date())}
                  onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
                />
              </Field>
            </div>
          )}
        </div>
      )}

      {mode === 'pr' && !pastePr && (
        <PullRequestPicker
          state={activity}
          query={prQuery}
          onQuery={setPrQuery}
          value={prPicked}
          onChange={(url) => {
            setPrPicked(url)
            setError(null)
          }}
          onPaste={() => setPastePr(true)}
        />
      )}

      {mode === 'pr' && pastePr && (
        <div className="flex flex-col gap-2">
          <Field
            label="Pull request"
            description={
              prRepoMatch
                ? `From ${prRepoMatch.fullName}.`
                : 'Paste the PR link, or write owner/repo#123. It has to be in a connected repository.'
            }
          >
            <Input
              value={prUrl}
              onChange={(e) => setPrUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
              leadingIcon={GitPullRequest}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Button type="button" variant="link" size="sm" className="self-start" onClick={() => setPastePr(false)}>
            Pick from recent pull requests
          </Button>
        </div>
      )}

      {mode === 'release' && !typeTag && (
        <div className="flex flex-col gap-2">
          <Field label="Release" description="We compare it with the release before it.">
            {activity.status === 'loading' || activity.status === 'idle' ? (
              <Skeleton className="h-9 w-full" />
            ) : activity.status === 'error' ? (
              <p className="text-sm text-fg-muted">
                GitHub didn&rsquo;t return the releases.{' '}
                <button type="button" onClick={activity.retry} className="rounded-sm font-medium text-fg underline underline-offset-2 focus-ring">
                  Try again
                </button>
              </p>
            ) : (
              <Select
                value={tagPicked ?? ''}
                onValueChange={(v) => {
                  setTagPicked(v)
                  setError(null)
                }}
                options={activity.releases.map((r) => ({
                  value: r.tag,
                  label: [r.tag, r.name && r.name !== r.tag ? r.name : null, r.drafted ? 'drafted' : null, r.prerelease ? 'pre-release' : null]
                    .filter(Boolean)
                    .join(' \u00b7 '),
                }))}
                className="font-mono"
              />
            )}
          </Field>
          <Button type="button" variant="link" size="sm" className="self-start" onClick={() => setTypeTag(true)}>
            Type a tag instead
          </Button>
        </div>
      )}

      {mode === 'release' && typeTag && (
        <div className="flex flex-col gap-2">
          <Field label="Release tag" description="We compare it with the tag before it.">
            <Input
              value={releaseTag}
              onChange={(e) => setReleaseTag(e.target.value)}
              placeholder="v1.4.0"
              leadingIcon={Tag}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          {activity.releases.length > 0 && (
            <Button type="button" variant="link" size="sm" className="self-start" onClick={() => setTypeTag(false)}>
              Pick from recent releases
            </Button>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-col gap-1 rounded-md border border-danger/25 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <span>{error}</span>
          {activeJobId && (
            <Link href={`/jobs/${activeJobId}`} className="font-medium text-danger underline underline-offset-2 focus-ring">
              Open the run in progress
            </Link>
          )}
        </div>
      )}

      <div className={cn('flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between')}>
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <PlatformIcon platform="linkedin" className="size-3.5" />
          <PlatformIcon platform="twitter" className="size-3.5" />
          You get a LinkedIn post and an X post to edit before anything goes out.
        </p>
        <Button type="submit" size="lg" loading={loading} disabled={loading || !repoId}>
          {!loading && <PenLine strokeWidth={1.75} aria-hidden="true" />}
          {loading ? 'Starting' : 'Write drafts'}
        </Button>
      </div>
    </form>
  )
}

function PullRequestPicker({
  state,
  query,
  onQuery,
  value,
  onChange,
  onPaste,
}: {
  state: RepoActivityState & { retry: () => void }
  query: string
  onQuery: (q: string) => void
  value: string | null
  onChange: (url: string) => void
  onPaste: () => void
}) {
  const labelId = React.useId()
  const q = query.trim().toLowerCase()
  const visible = q
    ? state.pullRequests.filter((pr) => pr.title.toLowerCase().includes(q) || String(pr.number).includes(q.replace(/^#/, '')))
    : state.pullRequests

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = Math.max(0, visible.findIndex((pr) => pr.url === value))
    const next = visible[(index + (event.key === 'ArrowDown' ? 1 : visible.length - 1)) % visible.length]
    if (!next) return
    onChange(next.url)
    const el = event.currentTarget.querySelector<HTMLElement>(`[data-url="${CSS.escape(next.url)}"]`)
    el?.focus()
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium text-fg">
        Pull request
      </span>
      {state.status === 'error' ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-fg-muted">
          GitHub didn&rsquo;t return the recent pull requests.
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={state.retry}>
              Try again
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onPaste}>
              Paste a link instead
            </Button>
          </div>
        </div>
      ) : (
        <>
          {state.pullRequests.length > 6 && (
            <Input
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search by title or number"
              aria-label="Search pull requests"
              leadingIcon={Search}
              autoComplete="off"
            />
          )}
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            {state.status !== 'ready' ? (
              <div aria-busy="true" aria-label="Loading pull requests" className="divide-y divide-line">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <Skeleton className="size-4 rounded-full" />
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Skeleton className="h-4 w-56 max-w-full" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </div>
                ))}
              </div>
            ) : state.pullRequests.length === 0 ? (
              <p className="px-4 py-6 text-sm text-fg-muted">No merged pull requests in this repository yet.</p>
            ) : visible.length === 0 ? (
              <p className="px-4 py-6 text-sm text-fg-muted">No pull requests match.</p>
            ) : (
              <div
                role="radiogroup"
                aria-labelledby={labelId}
                onKeyDown={onKeyDown}
                className="max-h-72 divide-y divide-line overflow-y-auto overscroll-contain"
              >
                {visible.map((pr) => {
                  const checked = pr.url === value
                  return (
                    <button
                      key={pr.url}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      data-url={pr.url}
                      aria-label={`#${pr.number} ${pr.title}, ${pullRequestMeta(pr)}${pr.drafted ? ', already drafted' : ''}`}
                      tabIndex={checked || (!value && pr === visible[0]) ? 0 : -1}
                      onClick={() => onChange(pr.url)}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-120 focus-ring-inset',
                        checked ? 'bg-accent-soft/40' : 'hover:bg-sunken/60',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-120',
                          checked ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong bg-surface',
                        )}
                      >
                        {checked && <Check className="size-2.5" strokeWidth={3} />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="shrink-0 font-mono text-sm text-fg-muted">#{pr.number}</span>
                          <span className="min-w-0 truncate text-sm font-medium text-fg">{pr.title}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-fg-subtle">
                          {pullRequestMeta(pr)}
                          {pr.drafted && <span className="text-fg-muted">Already drafted</span>}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <Button type="button" variant="link" size="sm" className="self-start" onClick={onPaste}>
            Paste a link instead
          </Button>
        </>
      )}
    </div>
  )
}
