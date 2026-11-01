'use client'

import * as React from 'react'
import { readError, type GithubRepoOption } from './client'

/** Loads GET /api/github/repos once, with retry. */
export function useGithubRepos(enabled: boolean) {
  const [repos, setRepos] = React.useState<GithubRepoOption[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [accessUrl, setAccessUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/github/repos', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            await readError(
              res,
              'GitHub didn’t return your repositories. Try again; if it keeps failing, sign out and sign in with GitHub again.',
            ),
          )
        }
        const data = (await res.json()) as { repos?: GithubRepoOption[]; accessUrl?: string }
        if (!cancelled) {
          setRepos(Array.isArray(data.repos) ? data.repos : [])
          setAccessUrl(typeof data.accessUrl === 'string' ? data.accessUrl : null)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'We couldn’t reach GitHub. Check your connection and try again.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, attempt])

  const retry = React.useCallback(() => setAttempt((n) => n + 1), [])
  return { repos, loading, error, retry, accessUrl }
}

/** Connects one repo through POST /api/repos. Returns the new repo id, or the Response on failure. */
export async function connectRepo(
  repo: GithubRepoOption,
): Promise<{ ok: true; id: string | null; warning: string | null } | { ok: false; res: Response }> {
  const res = await fetch('/api/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Only the id: the server reads everything else from GitHub.
    body: JSON.stringify({ githubRepoId: repo.githubRepoId }),
  })
  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as { repo?: { id?: string }; warning?: string }
    return { ok: true, id: data.repo?.id ?? null, warning: data.warning ?? null }
  }
  if (res.status === 409) {
    // Already connected: treat as success.
    return { ok: true, id: null, warning: null }
  }
  return { ok: false, res }
}
