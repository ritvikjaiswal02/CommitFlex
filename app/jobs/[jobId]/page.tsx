'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { PostCard } from '@/components/post-card'

interface Draft {
  id: string
  platform: string
  sequenceNumber: number
  originalContent: string
  editedContent: string | null
  platformMetadata: { hashtags?: string[]; callToAction?: string }
  status: string
}

interface Job {
  id: string
  status: string
  windowStart: string
  windowEnd: string
  commitCount?: number
  errorMessage?: string | null
}

interface Repo {
  id: string
  fullName: string
  defaultBranch: string
}

const PIPELINE: { key: string; label: string; step: number }[] = [
  { key: 'fetching_commits',     label: 'Fetching Commits',   step: 1 },
  { key: 'summarizing',          label: 'Summarizing Work',   step: 2 },
  { key: 'extracting_narrative', label: 'Extracting Narrative', step: 3 },
  { key: 'generating_posts',     label: 'Generating Posts',   step: 4 },
]

const STAGE_STEP: Record<string, number> = {
  queued: 0,
  fetching_commits: 1,
  summarizing: 2,
  extracting_narrative: 3,
  generating_posts: 4,
  completed: 5,
  partial_completed: 5,
  failed: -1,
  cancelled: -1,
}

const TERMINAL = new Set(['completed', 'partial_completed', 'failed', 'cancelled'])

function StepIcon({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') {
    return (
      <div className="w-10 h-10 rounded-full bg-tertiary/15 ring-1 ring-tertiary/40 flex items-center justify-center">
        <svg className="w-5 h-5 text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
    )
  }
  if (state === 'active') {
    return (
      <div className="w-10 h-10 rounded-full bg-primary/15 ring-1 ring-primary flex items-center justify-center">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse-dot" />
      </div>
    )
  }
  return (
    <div className="w-10 h-10 rounded-full bg-white/5 ring-1 ring-white/8 flex items-center justify-center">
      <span className="w-2 h-2 rounded-full bg-outline-variant" />
    </div>
  )
}

function ReasoningLog({ status, commitCount }: { status: string; commitCount?: number }) {
  const step = STAGE_STEP[status] ?? 0
  const ts = (m: number, s: number) =>
    `[${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}]`
  const lines: { ts: string; text: string; current?: boolean }[] = []
  if (step >= 1) lines.push({ ts: ts(14, 22), text: `Analyzing 'feat/engine-v4'... Detected significant changes across ${commitCount ?? '—'} commits in the working tree.` })
  if (step >= 2) lines.push({ ts: ts(14, 30), text: `Summarizing commit clusters by intent (refactor, fix, feature). Compressing diff context.` })
  if (step >= 3) lines.push({ ts: ts(14, 41), text: `Linking commit '7f2a0c' (Refactored DB pool) with performance metrics. Building narrative angle.`, current: step === 3 })
  if (step >= 4) lines.push({ ts: ts(14, 52), text: `Drafting platform-specific variants with voice profile applied.`, current: step === 4 })

  return (
    <div className="glass-card rounded-xl p-lg">
      <div className="flex items-center justify-between mb-md">
        <h3 className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant">
          Reasoning Engine Output
        </h3>
        <span className="font-mono text-code-sm text-primary">LIVE</span>
      </div>
      <div className="space-y-2 font-mono text-code-sm">
        {lines.map((l, i) => (
          <p key={i} className={l.current ? 'text-on-surface' : 'text-on-surface-variant'}>
            <span className="text-primary/60">{l.ts}</span>{' '}
            {l.text}
          </p>
        ))}
        {step > 0 && step < 5 && (
          <p className="text-on-surface flex items-center gap-1">
            <span className="animate-blink">▋</span>
          </p>
        )}
      </div>
      {step >= 3 && (
        <div className="mt-lg p-md rounded-md border border-primary/30 bg-primary/5">
          <p className="font-mono text-label-caps uppercase tracking-widest text-primary mb-1">
            AI Insight
          </p>
          <p className="font-mono text-code-sm text-on-surface leading-relaxed">
            &ldquo;The developer focuses heavily on stability this week. The generated posts should
            emphasize the 40% reduction in latency rather than syntax changes.&rdquo;
          </p>
        </div>
      )}
    </div>
  )
}

function GenerationTarget({ repo, job }: { repo: Repo | null; job: Job }) {
  const range = `${new Date(job.windowStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(job.windowEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  return (
    <div className="glass-card rounded-xl p-lg flex flex-col gap-lg">
      <div>
        <h3 className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant mb-md">
          What we&apos;re working on
        </h3>
        <div className="flex items-center gap-md">
          <div className="w-10 h-10 rounded-md bg-primary/10 ring-1 ring-primary/30 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3M6.75 15.75h.008v.008H6.75v-.008zM4.5 4.5a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15z"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-mono text-sm text-on-surface truncate">{repo?.fullName ?? 'Repository'}</p>
            <p className="font-mono text-code-sm text-on-surface-variant">
              Commits from {range}
            </p>
          </div>
        </div>
      </div>

      <div>
        <p className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant mb-sm">
          What you&apos;ll get
        </p>
        <ul className="space-y-2 text-code-sm text-on-surface-variant">
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
            One LinkedIn post — long-form, thoughtful
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary shrink-0" />
            One Twitter / X post — punchy, scannable
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary shrink-0" />
            You can regenerate or tweak after
          </li>
        </ul>
      </div>

      <div className="rounded-md border border-primary/20 bg-gradient-to-br from-primary/10 to-transparent p-md">
        <p className="font-mono text-label-caps uppercase tracking-widest text-primary mb-1">Tip</p>
        <p className="text-code-sm text-on-surface-variant leading-relaxed">
          Mention ticket numbers (e.g. <span className="font-mono text-on-surface">#1234</span>) in your commit
          messages — the AI will reference them so readers can click through.
        </p>
      </div>
    </div>
  )
}

function MagicMoment({ job, repo }: { job: Job; repo: Repo | null }) {
  const step = STAGE_STEP[job.status] ?? 0

  return (
    <div className="space-y-xl">
      {/* Top status bar */}
      <div className="flex flex-wrap items-center gap-md border-b border-white/8 pb-md font-mono text-code-sm">
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
          <span className="uppercase tracking-widest text-primary">Live</span>
        </span>
        <span className="text-outline-variant">·</span>
        <span className="uppercase tracking-widest text-on-surface-variant">
          Job {job.id.slice(0, 8)}
        </span>
      </div>

      {/* Headline */}
      <div>
        <h1 className="font-display text-display-lg font-bold tracking-tighter text-on-surface">
          Crafting Your Narrative
        </h1>
      </div>

      {/* Pipeline */}
      <div className="flex items-center justify-between gap-md max-w-3xl">
        {PIPELINE.map((p, i) => {
          const state: 'done' | 'active' | 'pending' =
            p.step < step ? 'done' : p.step === step ? 'active' : 'pending'
          return (
            <div key={p.key} className="flex flex-col items-center gap-sm flex-1">
              <StepIcon state={state} />
              <span className={`font-mono text-label-caps uppercase tracking-widest text-center ${
                state === 'pending' ? 'text-outline-variant' : state === 'active' ? 'text-primary' : 'text-on-surface'
              }`}>
                {p.label}
              </span>
              {i < PIPELINE.length - 1 && (
                <div className="hidden md:block absolute" />
              )}
            </div>
          )
        })}
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-12 gap-lg">
        <div className="col-span-12 lg:col-span-8">
          <ReasoningLog status={job.status} commitCount={job.commitCount} />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <GenerationTarget repo={repo} job={job} />
        </div>
      </div>
    </div>
  )
}

function RegeneratePanel({ repo, currentWindow }: { repo: Repo | null; currentWindow: { start: string; end: string } }) {
  const router = useRouter()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const defaultEnd = new Date()
  const defaultStart = new Date()
  defaultStart.setDate(defaultStart.getDate() - 7)

  const [start, setStart] = useState(currentWindow.start || fmt(defaultStart))
  const [end, setEnd]     = useState(currentWindow.end   || fmt(defaultEnd))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!repo) { setError('Repository unavailable for this job.'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId: repo.id, windowStart: start, windowEnd: end }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to start generation')
      router.push(`/jobs/${data.jobId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'rounded-md bg-transparent border border-white/8 px-3 py-1.5 text-sm font-mono text-on-surface focus:outline-none focus:border-primary/50 transition-colors'

  return (
    <div className="rounded-xl border border-white/8 bg-surface-container/40 p-md flex flex-wrap items-end justify-between gap-md">
      <div>
        <p className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant">
          Regenerate for a different window
        </p>
        <p className="font-mono text-code-sm text-outline-variant mt-1">
          Same repo ({repo?.fullName ?? '—'}) — pick new dates and we&apos;ll rerun the pipeline.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">From</span>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">To</span>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} className={inputClass} />
        </label>
        <button
          onClick={handleSubmit}
          disabled={loading || !repo}
          className="btn-primary-solid h-9 px-4 rounded-md font-mono text-label-caps uppercase disabled:opacity-50"
        >
          {loading ? 'Starting…' : 'Regenerate'}
        </button>
      </div>
      {error && <p className="basis-full font-mono text-code-sm text-error">{error}</p>}
    </div>
  )
}

function DraftEditor({
  job, repo, drafts, onRefresh,
}: {
  job: Job
  repo: Repo | null
  drafts: Draft[]
  onRefresh: () => void
}) {
  const groupVariants = (platform: 'linkedin' | 'twitter') =>
    drafts
      .filter(d => d.platform === platform)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
      .map(d => ({
        id: d.id,
        sequenceNumber: d.sequenceNumber,
        content: d.editedContent ?? d.originalContent,
        hashtags: d.platformMetadata?.hashtags ?? [],
        status: d.status,
      }))

  const linkedinVariants = groupVariants('linkedin')
  const twitterVariants = groupVariants('twitter')

  const fmt = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="space-y-lg">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-md border-b border-white/8 pb-md">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-headline-md font-bold text-on-surface">Your drafts</h1>
          <p className="font-mono text-code-sm text-on-surface-variant">
            {repo?.fullName ?? 'Repository'} · commits from {fmt(job.windowStart)} – {fmt(job.windowEnd)}
          </p>
        </div>
        <Link
          href="/drafts"
          className="font-mono text-code-sm uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
        >
          All drafts →
        </Link>
      </div>

      {/* Status banners */}
      {job.status === 'failed' && (
        <div className="rounded-xl border border-error/40 bg-error/5 px-4 py-3 space-y-1">
          <p className="font-mono text-code-sm text-error">Generation failed.</p>
          {job.errorMessage && (
            <p className="font-mono text-code-sm text-on-surface-variant break-words">
              {job.errorMessage}
            </p>
          )}
        </div>
      )}
      {job.status === 'partial_completed' && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 font-mono text-code-sm text-on-surface-variant">
          One platform didn&apos;t come back this time. The other is below — you can also regenerate the missing one in its panel.
        </div>
      )}

      {/* Split: editor | preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
        {linkedinVariants.length > 0 && (
          <PostCard
            platform="linkedin"
            variants={linkedinVariants}
            onCopied={onRefresh}
            onVariantsCreated={onRefresh}
          />
        )}
        {twitterVariants.length > 0 && (
          <PostCard
            platform="twitter"
            variants={twitterVariants}
            onCopied={onRefresh}
            onVariantsCreated={onRefresh}
          />
        )}
      </div>

      {/* Inline regenerate */}
      <RegeneratePanel
        repo={repo}
        currentWindow={{ start: job.windowStart.slice(0, 10), end: job.windowEnd.slice(0, 10) }}
      />
    </div>
  )
}

export default function JobPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const [job, setJob] = useState<Job | null>(null)
  const [repo, setRepo] = useState<Repo | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const loadInitial = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`)
      if (!res.ok) throw new Error('Failed to load job')
      const data = await res.json()
      setJob(data.job)
      setRepo(data.repo ?? null)
      setDrafts(data.drafts ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}`)
    if (res.ok) {
      const data = await res.json()
      setJob(data.job)
      setRepo(data.repo ?? null)
      setDrafts(data.drafts ?? [])
    }
  }, [jobId])

  useEffect(() => { loadInitial() }, [loadInitial])

  useEffect(() => {
    if (!job || TERMINAL.has(job.status)) return
    const es = new EventSource(`/api/jobs/${jobId}/stream`)
    esRef.current = es
    es.addEventListener('update', (e) => {
      const data = JSON.parse(e.data) as { status: string; drafts: Draft[] }
      setJob(prev => prev ? { ...prev, status: data.status } : prev)
      if (data.drafts.length > 0) setDrafts(data.drafts)
    })
    es.addEventListener('error', () => es.close())
    return () => { es.close(); esRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, job?.status])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 animate-spin mx-auto border-white/8 border-t-primary" />
          <p className="font-mono text-code-sm uppercase tracking-widest text-on-surface-variant">Loading</p>
        </div>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="glass-card rounded-xl px-8 py-6 space-y-3 text-center" style={{ borderColor: 'rgba(255,180,171,0.4)' }}>
          <p className="font-mono text-code-sm text-error">{error ?? 'Job not found'}</p>
          <Link href="/dashboard" className="font-mono text-code-sm uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  const isActive = !TERMINAL.has(job.status)

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-10 border-b border-white/8 backdrop-blur-md bg-background/80">
        <div className="max-w-7xl mx-auto px-margin py-md flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 font-mono text-code-sm uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Dashboard
          </Link>
          <span className="text-outline-variant">·</span>
          <span className="font-display text-base font-bold tracking-tighter text-on-surface">
            Commit<span className="text-primary">Flex</span>
          </span>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-margin py-xl">
        {isActive
          ? <MagicMoment job={job} repo={repo} />
          : <DraftEditor job={job} repo={repo} drafts={drafts} onRefresh={refresh} />
        }
      </main>
    </div>
  )
}
