'use client'

import * as React from 'react'
import { Check, ExternalLink, FolderGit2, Lock, Plus, Search, ShieldAlert, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import { useUpgrade } from '@/components/billing/upgrade-provider'
import { formatWhen } from '@/components/app/format'
import { NO_ADMIN_HINT, canConnect, groupReposByOwner } from '@/components/onboarding/client'

export interface GithubRepo {
  githubRepoId: string
  name: string
  fullName: string
  url: string
  defaultBranch: string
  isPrivate: boolean
  description: string | null
  language: string | null
  updatedAt: string | null
  pushedAt?: string | null
  stars?: number
  owner?: string
  ownerType?: 'user' | 'org'
  personal?: boolean
  canAdmin?: boolean
  canPush?: boolean
}

export interface ConnectedRepo {
  id: string
  fullName: string
}

export interface RepoConnectProps {
  /** GitHub ids of repos that are already connected. */
  connectedGithubIds?: string[]
  onConnected?: (repo: ConnectedRepo) => void
  timezone?: string
  className?: string
}

export function filterGithubRepos(repos: GithubRepo[], query: string): GithubRepo[] {
  const q = query.trim().toLowerCase()
  if (!q) return repos
  return repos.filter(
    (r) =>
      r.fullName.toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q) ||
      (r.language ?? '').toLowerCase().includes(q),
  )
}

/**
 * Searchable list of the user's GitHub repositories with a Connect button
 * each. Connecting installs the webhook for pushes, pull requests and releases.
 */
export function RepoConnect({ connectedGithubIds = [], onConnected, timezone = 'UTC', className }: RepoConnectProps) {
  const { handlePlanError } = useUpgrade()
  const [repos, setRepos] = React.useState<GithubRepo[]>([])
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const [connecting, setConnecting] = React.useState<string | null>(null)
  const [connected, setConnected] = React.useState<Set<string>>(() => new Set(connectedGithubIds))
  const [accessUrl, setAccessUrl] = React.useState('https://github.com/settings/applications')

  // Key on the ids, not the array, so a fresh [] each render doesn't loop.
  const connectedKey = connectedGithubIds.join(',')
  React.useEffect(() => {
    setConnected(new Set(connectedKey ? connectedKey.split(',') : []))
  }, [connectedKey])

  const load = React.useCallback(async () => {
    setStatus('loading')
    setLoadError(null)
    try {
      const res = await fetch('/api/github/repos', { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as { repos?: GithubRepo[]; error?: string; accessUrl?: string }
      if (!res.ok || !data.repos) {
        setLoadError(data.error ?? 'GitHub did not return your repositories.')
        setStatus('error')
        return
      }
      setRepos(data.repos)
      if (data.accessUrl) setAccessUrl(data.accessUrl)
      setStatus('ready')
    } catch {
      setLoadError('Check your connection and try again.')
      setStatus('error')
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const connect = async (repo: GithubRepo) => {
    setConnecting(repo.githubRepoId)
    try {
      const res = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only the id: the server reads the rest from GitHub with your token.
        body: JSON.stringify({ githubRepoId: repo.githubRepoId }),
      })
      if (res.status === 402 && (await handlePlanError(res))) return
      const data = (await res.json().catch(() => ({}))) as {
        repo?: { id: string; fullName: string }
        warning?: string
        error?: string
        code?: string
      }
      if (res.status === 409) {
        setConnected((prev) => new Set(prev).add(repo.githubRepoId))
        toast.info(`${repo.fullName} is already connected`)
        return
      }
      if (!res.ok || !data.repo) {
        toast.error(`Couldn't connect ${repo.fullName}`, { description: data.error ?? 'Try again in a moment.' })
        return
      }
      setConnected((prev) => new Set(prev).add(repo.githubRepoId))
      if (data.warning) {
        toast.info(`Connected ${repo.fullName}`, { description: data.warning, duration: 10000 })
      } else {
        toast.success(`Connected ${repo.fullName}`, {
          description: 'CommitFlex now hears about pushes, merged pull requests and releases.',
        })
      }
      onConnected?.({ id: data.repo.id, fullName: data.repo.fullName })
    } catch {
      toast.error(`Couldn't connect ${repo.fullName}`, { description: 'Check your connection and try again.' })
    } finally {
      setConnecting(null)
    }
  }

  if (status === 'loading') {
    return (
      <div className={cn('flex flex-col gap-3', className)} aria-busy="true">
        <span className="sr-only">Loading your GitHub repositories</span>
        <Skeleton className="h-9 w-full" />
        <div className="overflow-hidden rounded-lg border border-line">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={cn('flex items-center justify-between gap-4 px-4 py-3', i > 0 && 'border-t border-line')}>
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <ErrorState
        className={className}
        title="Your GitHub repositories didn't load"
        description={loadError ?? undefined}
        onRetry={load}
      />
    )
  }

  const visible = filterGithubRepos(repos, query)

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your repositories"
        aria-label="Search your repositories"
        leadingIcon={Search}
      />
      {repos.length === 0 ? (
        <EmptyState
          size="sm"
          icon={FolderGit2}
          title="No repositories you can access"
          description="If your organisation restricts OAuth apps, an owner must approve CommitFlex in its settings."
          action={
            <ButtonLink href={accessUrl} target="_blank" rel="noreferrer" variant="secondary" size="sm">
              Review GitHub access
              <ExternalLink strokeWidth={1.75} aria-hidden="true" />
            </ButtonLink>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState size="sm" icon={Search} title="No repositories match" description="Try part of the name, or a language." />
      ) : (
        <div className="flex flex-col gap-5">
          {groupReposByOwner(visible).map((group, groupIndex, groups) => (
            <section key={group.key} aria-label={group.label} className="flex flex-col gap-2">
              {groups.length > 1 && <h3 className="text-xs font-medium text-fg-muted">{group.label}</h3>}
              <ul className="overflow-hidden rounded-lg border border-line bg-surface">
                {group.repos.map((repo, index) => (
                  <ConnectRow
                    key={repo.githubRepoId}
                    repo={repo}
                    first={index === 0}
                    isConnected={connected.has(repo.githubRepoId)}
                    connecting={connecting}
                    timezone={timezone}
                    onConnect={connect}
                  />
                ))}
              </ul>
              {groupIndex === groups.length - 1 && (
                <p className="text-xs text-fg-subtle">
                  Missing an organisation? An org owner may need to approve CommitFlex.{' '}
                  <a
                    href={accessUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-sm text-fg-muted underline underline-offset-2 hover:text-fg focus-ring"
                  >
                    Review GitHub access
                  </a>
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function ConnectRow({
  repo,
  first,
  isConnected,
  connecting,
  timezone,
  onConnect,
}: {
  repo: GithubRepo
  first: boolean
  isConnected: boolean
  connecting: string | null
  timezone: string
  onConnect: (repo: GithubRepo) => void
}) {
  const updated = repo.pushedAt ?? repo.updatedAt
  const noAdmin = !isConnected && !canConnect(repo)
  return (
    <li className={cn('flex items-center justify-between gap-4 px-4 py-3', !first && 'border-t border-line')}>
      <div className={cn('flex min-w-0 flex-col gap-1', noAdmin && 'opacity-70')}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-mono text-sm text-fg">{repo.fullName}</span>
          {repo.isPrivate && (
            <Badge variant="neutral">
              <Lock aria-hidden="true" strokeWidth={1.75} />
              Private
            </Badge>
          )}
        </div>
        {repo.description && <p className="truncate text-sm text-fg-muted">{repo.description}</p>}
        {noAdmin ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
            <ShieldAlert className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {NO_ADMIN_HINT}
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fg-subtle">
            {repo.language && <span>{repo.language}</span>}
            {typeof repo.stars === 'number' && repo.stars > 0 && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Star className="size-3" strokeWidth={1.75} aria-hidden="true" />
                {repo.stars.toLocaleString('en-US')}
                <span className="sr-only">stars</span>
              </span>
            )}
            {updated && <span>Updated {formatWhen(updated, timezone)}</span>}
          </p>
        )}
      </div>
      {isConnected ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-success">
          <Check className="size-4" strokeWidth={2} aria-hidden="true" />
          Connected
        </span>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onConnect(repo)}
          loading={connecting === repo.githubRepoId}
          disabled={connecting !== null || noAdmin}
          aria-label={`Connect ${repo.fullName}`}
        >
          {connecting !== repo.githubRepoId && <Plus strokeWidth={1.75} aria-hidden="true" />}
          Connect
        </Button>
      )}
    </li>
  )
}
