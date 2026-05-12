'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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

function SparkIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  )
}

export function GenerateForm({ repos }: GenerateFormProps) {
  const router = useRouter()
  const defaults = getDefaultDates()
  const [repoId, setRepoId] = useState(repos[0]?.id ?? '')
  const [windowStart, setWindowStart] = useState(defaults.start)
  const [windowEnd, setWindowEnd] = useState(defaults.end)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId, windowStart, windowEnd }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start generation')
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
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-sm" />
          <span className="font-mono text-code-sm uppercase tracking-widest text-primary">
            New Generation
          </span>
        </div>
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
              onChange={e => setRepoId(e.target.value)}
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

        {/* Date range */}
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
