'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button, ButtonLink } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import { toast } from '@/components/ui/toast'
import { Logo } from '@/components/brand/logo'
import { UpgradeProvider, useUpgrade } from '@/components/billing/upgrade-provider'
import { limitFor } from '@/lib/billing/catalog'
import { browserTimeZone, readError, type GithubRepoOption, type OnboardingState } from './client'
import { RepoPicker } from './repo-picker'
import { connectRepo, useGithubRepos } from './use-github-repos'

/**
 * `/onboarding?add=1`: the repo picker on its own, for people who finished
 * onboarding and want to watch more repos. Returns to Repositories.
 */
export function AddReposFlow() {
  const [state, setState] = React.useState<OnboardingState | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setError(null)
    fetch(`/api/onboarding?tz=${encodeURIComponent(browserTimeZone())}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, 'We couldn’t load your repositories. Try again.'))
        return (await res.json()) as OnboardingState
      })
      .then((data) => !cancelled && setState(data))
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'We couldn’t load your repositories. Try again.')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[808px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Logo href="/dashboard" />
          <ButtonLink href="/repositories" variant="ghost" size="sm">
            <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Back to Repositories
          </ButtonLink>
        </div>
      </header>
      {error ? (
        <main className="mx-auto w-full max-w-[680px] px-4 sm:px-6">
          <ErrorState title="Your repositories didn’t load" description={error} onRetry={() => setAttempt((n) => n + 1)} />
        </main>
      ) : !state ? (
        <main className="mx-auto flex w-full max-w-[680px] flex-col gap-4 px-4 py-10 sm:px-6" aria-busy="true">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="mt-4 h-72 w-full rounded-lg" />
        </main>
      ) : (
        <UpgradeProvider currentPlan={state.plan.id}>
          <AddReposBody state={state} />
        </UpgradeProvider>
      )}
    </div>
  )
}

function AddReposBody({ state }: { state: OnboardingState }) {
  const router = useRouter()
  const { openUpgrade, handlePlanError } = useUpgrade()
  const github = useGithubRepos(true)
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const connected = React.useMemo(() => new Set(state.repos.map((r) => r.fullName)), [state.repos])
  const max = limitFor(state.plan.id, 'repos')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selected.size === 0) {
      setError('Pick at least one repo to connect.')
      return
    }
    setBusy(true)
    setError(null)
    const byId = new Map((github.repos ?? []).map((r) => [r.githubRepoId, r]))
    const repos = Array.from(selected)
      .map((id) => byId.get(id))
      .filter((r): r is GithubRepoOption => !!r)
    let done = 0
    try {
      for (const repo of repos) {
        const outcome = await connectRepo(repo)
        if (!outcome.ok) {
          if (await handlePlanError(outcome.res)) return
          setError(await readError(outcome.res, `We couldn’t connect ${repo.fullName}. Try again.`))
          return
        }
        done += 1
      }
      toast.success(done === 1 ? 'Connected 1 repo' : `Connected ${done} repos`)
      router.push('/repositories')
      router.refresh()
    } catch {
      setError('The request was interrupted. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto flex max-w-[680px] flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold text-fg">Connect more repositories</h1>
            <p className="max-w-prose text-base text-fg-muted">
              Autopilot watches these for merged pull requests and releases. Repos you’ve already connected are
              marked.
            </p>
          </header>
          <RepoPicker
            repos={github.repos}
            loading={github.loading}
            error={github.error}
            onRetry={github.retry}
            accessUrl={github.accessUrl}
            selected={selected}
            connected={connected}
            max={max}
            onToggle={(id) => {
              setError(null)
              setSelected((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }}
            onLimitClick={() =>
              openUpgrade(
                { code: 'limit_reached', limit: 'repos', used: connected.size + selected.size, max },
                state.plan.id === 'pro' ? 'team' : 'pro',
              )
            }
          />
          <p className="text-sm text-fg-muted tabular-nums">
            {connected.size + selected.size} of {max} {max === 1 ? 'repo' : 'repos'} on your plan
          </p>
        </div>
      </main>
      <footer className="sticky bottom-0 border-t border-line bg-surface">
        <div className="mx-auto flex max-w-[808px] flex-col gap-2 px-4 py-3 sm:px-6">
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            <ButtonLink href="/repositories" variant="ghost">
              Cancel
            </ButtonLink>
            <Button type="submit" size="lg" loading={busy} disabled={selected.size === 0}>
              {selected.size <= 1 ? 'Connect repo' : `Connect ${selected.size} repos`}
            </Button>
          </div>
        </div>
      </footer>
    </form>
  )
}
