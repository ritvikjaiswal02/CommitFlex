'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Repo {
  id: string
  name: string
  fullName: string
  isPrivate: boolean
}

interface RepoManagerProps {
  repos: Repo[]
}

export function RepoManager({ repos: initialRepos }: RepoManagerProps) {
  const router = useRouter()
  const [repos, setRepos] = useState(initialRepos)
  const [removing, setRemoving] = useState<string | null>(null)
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

  return (
    <div className="space-y-2">
      {repos.map(repo => (
        <div
          key={repo.id}
          className="rounded-lg border border-white/8 hover:border-white/20 transition-colors p-4 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2 min-w-0">
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
      ))}
      {error && <p className="font-mono text-code-sm text-error">{error}</p>}
      <button
        onClick={() => router.push('/onboarding')}
        className="btn-ghost w-full h-10 rounded-lg text-sm font-mono text-on-surface-variant"
      >
        + Connect another repository
      </button>
    </div>
  )
}
