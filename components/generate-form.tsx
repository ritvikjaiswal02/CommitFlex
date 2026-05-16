'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const LAST_REPO_KEY = 'cf:last-repo-id'
const LAST_MODE_KEY = 'cf:last-mode'

type Mode = 'window' | 'pr' | 'release'

interface Repo {
  id: string
  name: string
  fullName: string
}

interface GenerateFormProps {
  repos: Repo[]
}

function getDefaultDates() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 7)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

const SparkIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
  </svg>
)
const CalendarIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
  </svg>
)

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: 'window',  label: 'Date range', hint: 'Commits from the last N days' },
  { key: 'pr',      label: 'Pull request', hint: 'Every commit on a specific PR' },
  { key: 'release', label: 'Release tag',  hint: 'Commits between this tag and the previous one' },
]

export function GenerateForm({ repos }: GenerateFormProps) {
  const router = useRouter()
  const defaults = getDefaultDates()

  const [repoId, setRepoId] = useState(repos[0]?.id ?? '')
  const [mode, setMode] = useState<Mode>('window')

  // Window mode
  const [windowStart, setWindowStart] = useState(defaults.start)
  const [windowEnd, setWindowEnd] = useState(defaults.end)
  // PR mode
  const [prUrl, setPrUrl] = useState('')
  // Release mode
  const [releaseTag, setReleaseTag] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hydrate from localStorage on mount.
  useEffect(() => {
    try {
      const savedRepo = window.localStorage.getItem(LAST_REPO_KEY)
      if (savedRepo && repos.some(r => r.id === savedRepo)) setRepoId(savedRepo)
      const savedMode = window.localStorage.getItem(LAST_MODE_KEY)
      if (savedMode === 'window' || savedMode === 'pr' || savedMode === 'release') {
        setMode(savedMode)
      }
    } catch { /* private mode, etc. */ }
  }, [repos])

  const selectRepo = (id: string) => {
    setRepoId(id)
    try { window.localStorage.setItem(LAST_REPO_KEY, id) } catch { /* ignore */ }
  }
  const selectMode = (m: Mode) => {
    setMode(m)
    setError(null)
    try { window.localStorage.setItem(LAST_MODE_KEY, m) } catch { /* ignore */ }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Build the request body based on the selected mode.
    let body: Record<string, unknown>
    if (mode === 'pr') {
      if (!prUrl.trim()) { setError('Paste a PR URL or owner/repo#123'); setLoading(false); return }
      body = { source: 'pr', repoId, prUrl: prUrl.trim() }
    } else if (mode === 'release') {
      if (!releaseTag.trim()) { setError('Release tag is required'); setLoading(false); return }
      body = { source: 'release', repoId, releaseTag: releaseTag.trim() }
    } else {
      body = { repoId, windowStart, windowEnd }
    }

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        // Surface a useful error — Zod errors come back as an object; native ones as strings.
        const msg =
          typeof data.error === 'string'
            ? data.error
            : data.error?.formErrors?.[0]
              ?? Object.values(data.error?.fieldErrors ?? {}).flat()[0]
              ?? 'Failed to start generation'
        throw new Error(String(msg))
      }
      router.push(`/jobs/${data.jobId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-lg bg-transparent border border-white/8 px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary/50 transition-colors'

  return (
    <div className={`glass-card rounded-xl overflow-hidden ${loading ? 'ai-focus' : ''}`}>
      <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between">
        <span className="font-mono text-code-sm uppercase tracking-widest text-primary">
          New Generation
        </span>
        <div className="flex items-center gap-2 font-mono text-code-sm text-on-surface-variant">
          <span>LinkedIn</span>
          <span className="text-outline-variant">·</span>
          <span>Twitter / X</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {/* Repository select */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 font-mono text-label-caps uppercase tracking-widest text-on-surface-variant">
            Repository
          </label>
          <div className="relative">
            <select
              value={repoId}
              onChange={e => selectRepo(e.target.value)}
              className={`${inputClass} appearance-none pr-8 font-mono`}
            >
              {repos.map(r => (
                <option key={r.id} value={r.id} className="bg-surface-container">
                  {r.fullName}
                </option>
              ))}
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-outline-variant">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Source mode tabs */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 font-mono text-label-caps uppercase tracking-widest text-on-surface-variant">
            Source
          </label>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/8 p-1">
            {MODES.map(m => (
              <button
                key={m.key}
                type="button"
                onClick={() => selectMode(m.key)}
                className={`px-3 py-1.5 rounded-md font-mono text-code-sm transition-colors text-center ${
                  mode === m.key
                    ? 'bg-primary/10 text-primary'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-white/[0.03]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="font-mono text-code-sm text-outline-variant pl-1">
            {MODES.find(m => m.key === mode)?.hint}
          </p>
        </div>

        {/* Per-mode inputs */}
        {mode === 'window' && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'From', value: windowStart, onChange: setWindowStart },
              { label: 'To',   value: windowEnd,   onChange: setWindowEnd   },
            ].map(({ label, value, onChange }) => (
              <div key={label} className="space-y-1.5">
                <label className="flex items-center gap-1.5 font-mono text-label-caps uppercase tracking-widest text-on-surface-variant">
                  <CalendarIcon />
                  {label}
                </label>
                <input
                  type="date"
                  value={value}
                  onChange={e => onChange(e.target.value)}
                  className={`${inputClass} font-mono`}
                />
              </div>
            ))}
          </div>
        )}

        {mode === 'pr' && (
          <div className="space-y-1.5">
            <label className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant">
              Pull request
            </label>
            <input
              type="text"
              value={prUrl}
              onChange={e => setPrUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/pull/123  ·  or  owner/repo#123"
              className={`${inputClass} font-mono`}
            />
            <p className="font-mono text-code-sm text-outline-variant pl-1">
              The PR must belong to the selected repo.
            </p>
          </div>
        )}

        {mode === 'release' && (
          <div className="space-y-1.5">
            <label className="font-mono text-label-caps uppercase tracking-widest text-on-surface-variant">
              Release tag
            </label>
            <input
              type="text"
              value={releaseTag}
              onChange={e => setReleaseTag(e.target.value)}
              placeholder="v1.4.0"
              className={`${inputClass} font-mono`}
            />
            <p className="font-mono text-code-sm text-outline-variant pl-1">
              We&apos;ll diff this tag against the one before it.
            </p>
          </div>
        )}

        {error && (
          <div className="font-mono text-code-sm px-3 py-2.5 rounded-lg border border-error/40 text-error bg-error/10">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !repoId}
          className="btn-primary-solid w-full h-11 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SparkIcon />
          {loading ? 'Starting generation...' : 'Generate posts'}
        </button>
      </form>
    </div>
  )
}
