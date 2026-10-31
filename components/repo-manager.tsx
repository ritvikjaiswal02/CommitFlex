'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  CircleAlert,
  CircleCheck,
  ExternalLink,
  FolderGit2,
  Lock,
  MoreHorizontal,
  PenLine,
  Play,
  Unplug,
  Webhook,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { planHasFeature, type PlanId } from '@/lib/billing/catalog'
import { useUpgrade } from '@/components/billing/upgrade-provider'

export interface ManagedRepo {
  id: string
  name: string
  fullName: string
  isPrivate: boolean
  autoGenerate?: boolean
  webhookId?: number | null
  autopilotEnabled?: boolean
  webhookEvents?: string[]
  defaultBranch?: string
}

export interface RepoManagerProps {
  repos: ManagedRepo[]
  /** Plan id, so the Autopilot hint and push drafting match what the plan runs. */
  planId?: PlanId
  /** Shown when the list is empty; defaults to a link to connect repositories. */
  emptyAction?: React.ReactNode
  className?: string
}

export type WebhookHealth = 'missing' | 'push_only' | 'complete'

export function webhookHealth(repo: Pick<ManagedRepo, 'webhookId' | 'webhookEvents'>): WebhookHealth {
  if (!repo.webhookId) return 'missing'
  const events = repo.webhookEvents ?? ['push']
  return events.includes('pull_request') && events.includes('release') ? 'complete' : 'push_only'
}

async function errorText(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown }
  return typeof body.error === 'string' && body.error ? body.error : fallback
}

/**
 * Connected repositories as rows: one Autopilot switch, webhook health with
 * a one-click upgrade, and the rest (including drafting after every push,
 * off by default) in the row menu.
 */
export function RepoManager({ repos: initialRepos, planId = 'pro', emptyAction, className }: RepoManagerProps) {
  const router = useRouter()
  const { handlePlanError, openUpgrade } = useUpgrade()
  const shipMoments = planHasFeature(planId, 'autopilot.ship_moments')
  const [repos, setRepos] = React.useState(initialRepos)
  const [busy, setBusy] = React.useState<Record<string, string>>({})
  const [confirming, setConfirming] = React.useState<ManagedRepo | null>(null)

  React.useEffect(() => setRepos(initialRepos), [initialRepos])

  const mark = (id: string, action: string | null) =>
    setBusy((prev) => {
      const next = { ...prev }
      if (action) next[id] = action
      else delete next[id]
      return next
    })

  const patch = async (repo: ManagedRepo, field: 'autopilotEnabled' | 'autoGenerate', value: boolean) => {
    const before = repo[field]
    setRepos((prev) => prev.map((r) => (r.id === repo.id ? { ...r, [field]: value } : r)))
    mark(repo.id, field)
    try {
      const res = await fetch(`/api/repos/${repo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        setRepos((prev) => prev.map((r) => (r.id === repo.id ? { ...r, [field]: before } : r)))
        if (res.status === 402 && (await handlePlanError(res))) return
        toast.error(
          field === 'autopilotEnabled' ? "Couldn't change autopilot for this repo" : "Couldn't change drafting after pushes",
          { description: await errorText(res, 'Try again in a moment.') },
        )
        return
      }
      if (field === 'autopilotEnabled') {
        toast.success(value ? `Autopilot on for ${repo.name}` : `Autopilot off for ${repo.name}`)
      } else {
        toast.success(value ? `Drafting after pushes to ${repo.name}` : `No longer drafting after pushes to ${repo.name}`)
      }
      router.refresh()
    } catch {
      setRepos((prev) => prev.map((r) => (r.id === repo.id ? { ...r, [field]: before } : r)))
      toast.error('Your change was not saved', { description: 'Check your connection and try again.' })
    } finally {
      mark(repo.id, null)
    }
  }

  const updateWebhook = async (repo: ManagedRepo) => {
    mark(repo.id, 'webhook')
    try {
      const res = await fetch(`/api/repos/${repo.id}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) {
        toast.error(`Couldn't update the webhook on ${repo.fullName}`, {
          description: await errorText(res, 'GitHub refused the change. Check that you are an admin of the repository.'),
        })
        return
      }
      const body = (await res.json().catch(() => ({}))) as { repo?: Partial<ManagedRepo> }
      setRepos((prev) =>
        prev.map((r) =>
          r.id === repo.id
            ? {
                ...r,
                webhookId: body.repo?.webhookId ?? r.webhookId ?? 1,
                webhookEvents: body.repo?.webhookEvents ?? ['push', 'pull_request', 'release'],
              }
            : r,
        ),
      )
      toast.success('Webhook updated', { description: 'Merged pull requests and releases now reach CommitFlex.' })
    } catch {
      toast.error(`Couldn't update the webhook on ${repo.fullName}`, { description: 'Check your connection and try again.' })
    } finally {
      mark(repo.id, null)
    }
  }

  const runNow = async (repo: ManagedRepo) => {
    mark(repo.id, 'run')
    try {
      const res = await fetch('/api/autopilot/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId: repo.id }),
      })
      if (res.status === 402 && (await handlePlanError(res))) return
      const body = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string }
      if (res.status === 409 && body.jobId) {
        router.push(`/jobs/${body.jobId}`)
        return
      }
      if (!res.ok || !body.jobId) {
        toast.error("Autopilot didn't start", { description: body.error ?? 'Try again in a moment.' })
        return
      }
      router.push(`/jobs/${body.jobId}`)
    } catch {
      toast.error("Autopilot didn't start", { description: 'Check your connection and try again.' })
    } finally {
      mark(repo.id, null)
    }
  }

  const disconnect = async (repo: ManagedRepo) => {
    mark(repo.id, 'remove')
    try {
      const res = await fetch(`/api/repos/${repo.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        toast.error(`Couldn't disconnect ${repo.fullName}`, { description: await errorText(res, 'Try again in a moment.') })
        return
      }
      setRepos((prev) => prev.filter((r) => r.id !== repo.id))
      toast(`Disconnected ${repo.fullName}`, {
        description: 'The webhook is removed. Drafts and published posts stay.',
      })
      router.refresh()
    } catch {
      toast.error(`Couldn't disconnect ${repo.fullName}`, { description: 'Check your connection and try again.' })
    } finally {
      mark(repo.id, null)
      setConfirming(null)
    }
  }

  if (repos.length === 0) {
    return (
      <div className={cn('rounded-lg border border-line bg-surface px-5', className)}>
        <EmptyState
          icon={FolderGit2}
          title="No repositories yet"
          description="Connect the projects you'd talk about publicly. CommitFlex reads commit messages, never your code."
          action={emptyAction}
        />
      </div>
    )
  }

  return (
    <>
      <ul aria-label="Connected repositories" className={cn('overflow-hidden rounded-lg border border-line bg-surface', className)}>
        {repos.map((repo, index) => {
          const health = webhookHealth(repo)
          const autopilot = repo.autopilotEnabled ?? true
          const autoGenerate = repo.autoGenerate ?? false
          const action = busy[repo.id]
          const switchId = `repo-${repo.id}`
          return (
            <li key={repo.id} className={cn('flex flex-col gap-4 px-4 py-4 sm:px-5', index > 0 && 'border-t border-line')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-sm font-medium text-fg">{repo.fullName}</span>
                    {repo.isPrivate && (
                      <Badge variant="neutral">
                        <Lock aria-hidden="true" strokeWidth={1.75} />
                        Private
                      </Badge>
                    )}
                    {!autopilot && <Badge variant="outline">Autopilot off</Badge>}
                  </div>
                  {health === 'complete' ? (
                    <p className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
                      <CircleCheck className="size-3.5 text-success" strokeWidth={1.75} aria-hidden="true" />
                      Hears pushes, merged pull requests and releases
                    </p>
                  ) : (
                    <p className="inline-flex items-start gap-1.5 text-sm text-fg-muted">
                      <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" strokeWidth={1.75} aria-hidden="true" />
                      {health === 'missing'
                        ? "No webhook, so CommitFlex can't see merges or releases here."
                        : 'Only hears pushes. Update the webhook to draft from merged pull requests and releases.'}
                    </p>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${repo.fullName}`} disabled={Boolean(action)} />}
                  >
                    <MoreHorizontal strokeWidth={1.75} aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLinkItem href={`/drafts/new?repo=${repo.id}`} icon={PenLine}>
                      Draft a post
                    </DropdownMenuLinkItem>
                    <DropdownMenuItem icon={Play} onSelect={() => void runNow(repo)}>
                      Run autopilot now
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={Webhook} onSelect={() => void updateWebhook(repo)}>
                      {health === 'missing' ? 'Install webhook' : 'Reinstall webhook'}
                    </DropdownMenuItem>
                    {planId !== 'free' && health !== 'missing' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                          checked={autoGenerate}
                          onCheckedChange={(v) => void patch(repo, 'autoGenerate', v)}
                          disabled={Boolean(action)}
                        >
                          Also draft after every push
                          <span className="block text-xs text-fg-muted">Uses more drafts</span>
                        </DropdownMenuCheckboxItem>
                      </>
                    )}
                    <DropdownMenuLinkItem href={`https://github.com/${repo.fullName}`} icon={ExternalLink} external>
                      Open on GitHub
                    </DropdownMenuLinkItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem icon={Unplug} variant="danger" onSelect={() => setConfirming(repo)}>
                      Disconnect
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
                <div className="flex items-center gap-3">
                  <Switch
                    id={`${switchId}-autopilot`}
                    checked={autopilot}
                    onCheckedChange={(v) => patch(repo, 'autopilotEnabled', v)}
                    disabled={Boolean(action)}
                    aria-describedby={`${switchId}-autopilot-hint`}
                  />
                  <label htmlFor={`${switchId}-autopilot`} className="flex flex-col">
                    <span className="text-sm font-medium text-fg">Autopilot</span>
                    <span id={`${switchId}-autopilot-hint`} className="text-xs text-fg-muted">
                      {shipMoments
                        ? 'Merged pull requests, releases and the weekly digest'
                        : 'Weekly digest. Merged PRs and releases need Pro'}
                    </span>
                  </label>
                  {!shipMoments && (
                    <button
                      type="button"
                      onClick={() => openUpgrade({ code: 'feature_locked', feature: 'autopilot.ship_moments' }, 'pro')}
                      className="rounded-sm focus-ring-surface"
                      aria-label="Ship moments need Pro. See plans"
                    >
                      <Badge variant="accent">Pro</Badge>
                    </button>
                  )}
                </div>
                {health !== 'complete' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => updateWebhook(repo)}
                    loading={action === 'webhook'}
                    className="self-start sm:ml-auto"
                  >
                    {action !== 'webhook' && <Webhook strokeWidth={1.75} aria-hidden="true" />}
                    {health === 'missing' ? 'Install webhook' : 'Update webhook'}
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {confirming?.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              CommitFlex removes the webhook and stops drafting from this repository. Drafts, queued posts and published
              posts stay where they are. You can connect it again any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              closeOnClick={false}
              loading={confirming ? busy[confirming.id] === 'remove' : false}
              onClick={() => confirming && disconnect(confirming)}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
