'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Repo {
  id: string
  name: string
  fullName: string
  isPrivate: boolean
  autoGenerate?: boolean
  webhookId?: number | null
}

interface RepoManagerProps {
  repos: Repo[]
}

export function RepoManager({ repos: initialRepos }: RepoManagerProps) {
  const router = useRouter()
  const [repos, setRepos] = useState(initialRepos)
  const [removing, setRemoving] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRemove = async (repoId: string) => {
    setRemoving(repoId)
    setError(null)
    try {
      const res = await fetch(`/api/repos/${repoId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove repo')
      setRepos(prev => prev.filter(r => r.id !== repoId))
      if (repos.length === 1) router.push('/onboarding')
    } catch {
      setError('Failed to remove repository')
    } finally {
      setRemoving(null)
    }
  }

  const handleToggleAuto = async (repo: Repo) => {
    setToggling(repo.id)
    setError(null)
    const next = !repo.autoGenerate
    // Optimistic — flip immediately, rollback on error.
    setRepos(prev => prev.map(r => r.id === repo.id ? { ...r, autoGenerate: next } : r))
    try {
      const res = await fetch(`/api/repos/${repo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoGenerate: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setRepos(prev => prev.map(r => r.id === repo.id ? { ...r, autoGenerate: !next } : r))
      setError('Failed to update auto-generate setting')
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="space-y-2">
      {repos.map(repo => {
        const hasWebhook = !!repo.webhookId
        const auto = !!repo.autoGenerate
        return (
          <div
            key={repo.id}
            className="rounded-lg border border-white/8 hover:border-white/20 transition-colors p-4 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                {hasWebhook && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-tertiary shrink-0"
                    title="Webhook installed — pushes to default branch auto-generate"
                  />
                )}
                <span className="font-mono text-sm text-on-surface truncate">{repo.fullName}</span>
                {repo.isPrivate && <span className="chip chip-tertiary">Private</span>}
              </div>
              <button
                onClick={() => handleRemove(repo.id)}
                disabled={removing === repo.id}
                className="btn-ghost shrink-0 px-3 h-8 rounded-lg font-mono text-label-caps uppercase text-error border-error/30 hover:bg-error/10"
              >
                {removing === repo.id ? 'Removing...' : 'Remove'}
              </button>
            </div>

            {/* Auto-generate toggle row — only visible when a webhook is installed. */}
            {hasWebhook && (
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <p className="text-sm text-on-surface">Auto-generate on push</p>
                  <p className="font-mono text-code-sm text-on-surface-variant mt-0.5">
                    Run the pipeline whenever you push to {repo.fullName.split('/')[1] ?? 'this repo'}&apos;s default branch.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleAuto(repo)}
                  disabled={toggling === repo.id}
                  aria-pressed={auto}
                  className={`relative h-6 w-11 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
                    auto ? 'bg-primary' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      auto ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </label>
            )}
          </div>
        )
      })}
      {error && <p className="font-mono text-code-sm text-error">{error}</p>}
      <button
        onClick={() => router.push('/onboarding?add=1')}
        className="btn-ghost w-full h-10 rounded-lg text-sm font-mono text-on-surface-variant"
      >
        + Connect more repositories
      </button>
    </div>
  )
}
