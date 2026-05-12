'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface GithubRepo {
  githubRepoId: string
  name: string
  fullName: string
  url: string
  defaultBranch: string
  isPrivate: boolean
  description: string | null
  language: string | null
  updatedAt: string | null
}

export function RepoConnect() {
  const router = useRouter()
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/github/repos')
      .then(r => r.json())
      .then(data => {
        if (data.repos) setRepos(data.repos)
        else setError(data.error ?? 'Failed to load repos')
      })
      .catch(() => setError('Failed to load repositories'))
      .finally(() => setLoading(false))
  }, [])

  const handleConnect = async (repo: GithubRepo) => {
    setConnecting(repo.githubRepoId)
    setError(null)
    try {
      const res = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubRepoId: repo.githubRepoId,
          name: repo.name,
          fullName: repo.fullName,
          url: repo.url,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to connect repo')
      }
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect repo')
    } finally {
      setConnecting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
        <span className="font-mono text-code-sm uppercase tracking-widest text-on-surface-variant">
          Fetching repositories
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-error/40 bg-error/10 p-4 font-mono text-code-sm text-error">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
      {repos.map(repo => (
        <div
          key={repo.githubRepoId}
          className="rounded-lg border border-white/8 hover:border-white/20 hover:bg-white/[0.03] transition-colors p-4 flex items-center justify-between gap-4"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm text-on-surface truncate">{repo.fullName}</span>
              {repo.isPrivate && <span className="chip chip-tertiary">Private</span>}
              {repo.language && <span className="chip chip-secondary">{repo.language}</span>}
            </div>
            {repo.description && (
              <p className="text-code-sm text-on-surface-variant mt-1 truncate">
                {repo.description}
              </p>
            )}
          </div>
          <button
            onClick={() => handleConnect(repo)}
            disabled={connecting === repo.githubRepoId}
            className="btn-primary-solid shrink-0 px-4 h-9 rounded-lg text-xs disabled:opacity-50"
          >
            {connecting === repo.githubRepoId ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      ))}
      {repos.length === 0 && (
        <p className="text-center text-on-surface-variant py-8">No repositories found.</p>
      )}
    </div>
  )
}
