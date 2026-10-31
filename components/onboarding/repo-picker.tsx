'use client'

import * as React from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { Check, ExternalLink, FolderGit2, Globe, Lock, Search, ShieldAlert, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Button, ButtonLink } from '@/components/ui/button'
import { NO_ADMIN_HINT, canConnect, groupReposByOwner, type GithubRepoOption } from './client'

export interface RepoPickerProps {
  repos: GithubRepoOption[] | null
  loading: boolean
  error: string | null
  onRetry: () => void
  /** githubRepoIds chosen in this session. */
  selected: Set<string>
  onToggle: (githubRepoId: string) => void
  /** Full names already connected (shown as selected and locked). */
  connected: Set<string>
  /** Max repos the plan watches, counting connected ones. */
  max: number
  onLimitClick: () => void
  /** GitHub page where the user reviews CommitFlex's access (org approvals). */
  accessUrl?: string | null
  className?: string
}

function lastActivity(repo: GithubRepoOption): string | null {
  const iso = repo.pushedAt ?? repo.updatedAt
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return `Updated ${formatDistanceToNowStrict(date, { addSuffix: true })}`
}

function RepoRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Skeleton className="size-4 rounded-sm" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-48 max-w-full" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  )
}

/** Searchable, multi-select list of the user's GitHub repos. */
export function RepoPicker({
  repos,
  loading,
  error,
  onRetry,
  selected,
  onToggle,
  connected,
  max,
  onLimitClick,
  accessUrl,
  className,
}: RepoPickerProps) {
  const [query, setQuery] = React.useState('')
  const searchId = React.useId()

  const filtered = React.useMemo(() => {
    if (!repos) return []
    const q = query.trim().toLowerCase()
    const list = q
      ? repos.filter((r) => r.fullName.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q))
      : repos
    // Connected repos first, then the rest in GitHub's recency order.
    return [...list].sort((a, b) => Number(connected.has(b.fullName)) - Number(connected.has(a.fullName)))
  }, [repos, query, connected])
  const groups = React.useMemo(() => groupReposByOwner(filtered), [filtered])
  const reviewHref = accessUrl ?? 'https://github.com/settings/applications'

  const total = connected.size + selected.size
  const atMax = total >= max

  if (error) {
    return (
      <div className={cn('rounded-lg border border-line bg-surface px-5', className)}>
        <ErrorState title="Your repositories didn’t load" description={error} onRetry={onRetry} />
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <Input
        id={searchId}
        type="search"
        leadingIcon={Search}
        placeholder="Search your repositories"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search repositories"
        disabled={loading}
        autoComplete="off"
      />

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        {loading || !repos ? (
          <div className="divide-y divide-line" aria-busy="true" aria-label="Loading repositories">
            {Array.from({ length: 5 }).map((_, i) => (
              <RepoRowSkeleton key={i} />
            ))}
          </div>
        ) : repos.length === 0 ? (
          <div className="px-5">
            <EmptyState
              icon={FolderGit2}
              size="sm"
              title="No repositories you can access"
              description="If your organisation restricts OAuth apps, an owner must approve CommitFlex in its settings."
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <ButtonLink href={reviewHref} target="_blank" rel="noreferrer" variant="secondary" size="sm">
                    Review GitHub access
                    <ExternalLink strokeWidth={1.75} aria-hidden="true" />
                  </ButtonLink>
                  <Button variant="ghost" size="sm" onClick={onRetry}>
                    Refresh list
                  </Button>
                </div>
              }
            />
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-8 text-sm text-fg-muted">No repositories match “{query.trim()}”.</p>
        ) : (
          <div className="max-h-[min(420px,52vh)] overflow-y-auto overscroll-contain">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.label}>
                {groups.length > 1 && (
                  <h3 className="sticky top-0 z-10 border-b border-line bg-sunken px-4 py-1.5 text-xs font-medium text-fg-muted">
                    {group.label}
                  </h3>
                )}
                <ul className="divide-y divide-line">
                  {group.repos.map((repo) => (
                    <RepoRow
                      key={repo.githubRepoId}
                      repo={repo}
                      connected={connected.has(repo.fullName)}
                      selected={selected.has(repo.githubRepoId)}
                      atMax={atMax}
                      onToggle={onToggle}
                      onLimitClick={onLimitClick}
                    />
                  ))}
                </ul>
              </section>
            ))}
            <p className="border-t border-line px-4 py-3 text-xs text-fg-subtle">
              Missing an organisation? An org owner may need to approve CommitFlex.{' '}
              <a
                href={reviewHref}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm text-fg-muted underline underline-offset-2 hover:text-fg focus-ring"
              >
                Review GitHub access
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}


function RepoRow({
  repo,
  connected: isConnected,
  selected,
  atMax,
  onToggle,
  onLimitClick,
}: {
  repo: GithubRepoOption
  connected: boolean
  selected: boolean
  atMax: boolean
  onToggle: (githubRepoId: string) => void
  onLimitClick: () => void
}) {
  const isSelected = isConnected || selected
  const noAdmin = !isConnected && !canConnect(repo)
  const blocked = !isSelected && atMax
  const inert = isConnected || noAdmin
  const [owner, name] = repo.fullName.includes('/') ? repo.fullName.split('/', 2) : ['', repo.fullName]
  const activity = lastActivity(repo)
  const hintId = React.useId()
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={isSelected}
        aria-disabled={inert || blocked || undefined}
        aria-describedby={noAdmin ? hintId : undefined}
        onClick={() => {
          if (inert) return
          if (blocked) {
            onLimitClick()
            return
          }
          onToggle(repo.githubRepoId)
        }}
        className={cn(
          'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors duration-120 focus-ring-inset',
          isSelected ? 'bg-accent-soft/40' : !inert && 'hover:bg-sunken/60',
          inert && 'cursor-default',
          blocked && 'cursor-not-allowed',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors duration-120',
            isSelected ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong bg-surface',
            (blocked || noAdmin) && 'opacity-50',
          )}
        >
          {isSelected && <Check className="size-3" strokeWidth={2.5} />}
        </span>
        <span className={cn('flex min-w-0 flex-1 flex-col gap-1', (blocked || noAdmin) && 'opacity-60')}>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-base font-medium text-fg sm:text-sm">
              {owner && <span className="font-normal text-fg-muted">{owner}/</span>}
              {name}
            </span>
            {isConnected && (
              <Badge variant="success" size="sm">
                Connected
              </Badge>
            )}
          </span>
          {repo.description && <span className="line-clamp-1 text-sm text-fg-muted">{repo.description}</span>}
          {noAdmin ? (
            <span id={hintId} className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
              <ShieldAlert className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {NO_ADMIN_HINT}
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
              <span className="inline-flex items-center gap-1">
                {repo.isPrivate ? (
                  <Lock className="size-3" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Globe className="size-3" strokeWidth={1.75} aria-hidden="true" />
                )}
                {repo.isPrivate ? 'Private' : 'Public'}
              </span>
              {repo.language && <span>{repo.language}</span>}
              {typeof repo.stars === 'number' && repo.stars > 0 && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Star className="size-3" strokeWidth={1.75} aria-hidden="true" />
                  {repo.stars.toLocaleString('en-US')}
                </span>
              )}
              {activity && <span>{activity}</span>}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
