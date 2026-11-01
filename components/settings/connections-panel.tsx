'use client'

import * as React from 'react'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { ArrowUpRight, Puzzle } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
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
import { PlatformIcon } from '@/components/brand/platform'
import { formatBillingDate } from '@/components/billing/format'
import type { LinkedInConnectionSummary } from '@/types/autopilot'
import { readError } from '@/components/onboarding/client'

interface IntegrationsResponse {
  linkedin: LinkedInConnectionSummary | null
  linkedinAvailable: boolean
  github: { login: string | null; scopes: string[] }
}

const REQUIRED_GITHUB_SCOPES = ['repo', 'admin:repo_hook']
const CONNECT_URL = '/api/integrations/linkedin/connect?returnTo=%2Fsettings%3Ftab%3Dconnections'
const DAY_MS = 24 * 60 * 60 * 1000

function Row({
  icon,
  title,
  status,
  children,
  actions,
}: {
  icon: React.ReactNode
  title: string
  status: React.ReactNode
  children?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <li className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sunken">{icon}</span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-medium text-fg">{title}</h3>
            {status}
          </div>
          {children && <div className="flex flex-col gap-1 text-sm text-fg-muted">{children}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 pl-14 sm:pl-0">{actions}</div>}
    </li>
  )
}

function PanelSkeleton() {
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface" aria-busy="true" aria-label="Loading connections">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="flex items-center gap-4 p-5">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function ConnectionsPanel() {
  const [data, setData] = React.useState<IntegrationsResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [disconnectOpen, setDisconnectOpen] = React.useState(false)
  const [disconnecting, setDisconnecting] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setError(null)
    fetch('/api/integrations', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, 'Connections didn’t load. Try again.'))
        return (await res.json()) as IntegrationsResponse
      })
      .then((d) => !cancelled && setData(d))
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Connections didn’t load. Try again.')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const disconnect = async () => {
    setDisconnecting(true)
    try {
      const res = await fetch('/api/integrations/linkedin/disconnect', { method: 'POST' })
      if (!res.ok) {
        toast.error('LinkedIn is still connected', { description: await readError(res, 'Try again in a moment.') })
        return
      }
      setData((d) => (d ? { ...d, linkedin: null } : d))
      setDisconnectOpen(false)
      toast.success('LinkedIn disconnected', { description: 'LinkedIn posts will open in the composer instead.' })
    } catch {
      toast.error('LinkedIn is still connected', { description: 'Check your connection and try again.' })
    } finally {
      setDisconnecting(false)
    }
  }

  if (error) return <ErrorState title="Connections didn’t load" description={error} onRetry={() => setAttempt((n) => n + 1)} />
  if (!data) return <PanelSkeleton />

  const missingScopes = REQUIRED_GITHUB_SCOPES.filter((s) => !data.github.scopes.includes(s))
  const li = data.linkedin
  const liActive = li?.status === 'active'
  const expiresAt = li?.expiresAt ? new Date(li.expiresAt) : null
  const expiringSoon = liActive && expiresAt && expiresAt.getTime() - Date.now() < 7 * DAY_MS

  return (
    <div className="flex flex-col gap-6">
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        <Row
          icon={<PlatformIcon platform="github" className="size-5" />}
          title="GitHub"
          status={
            missingScopes.length > 0 ? (
              <Badge variant="warning" size="sm">
                Needs permission
              </Badge>
            ) : (
              <Badge variant="success" size="sm">
                Connected
              </Badge>
            )
          }
          actions={
            missingScopes.length > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void signIn('github', { callbackUrl: '/settings?tab=connections' })}
              >
                Grant access
              </Button>
            ) : undefined
          }
        >
          <p>{data.github.login ? `Signed in as @${data.github.login}.` : 'Signed in with GitHub.'}</p>
          {missingScopes.length > 0 ? (
            <p>
              CommitFlex can’t install webhooks without{' '}
              {missingScopes.map((s, i) => (
                <React.Fragment key={s}>
                  {i > 0 && ' and '}
                  <code className="rounded-sm bg-sunken px-1 font-mono text-xs text-fg">{s}</code>
                </React.Fragment>
              ))}
              . Grant access again to fix it.
            </p>
          ) : (
            <p>Reads commit messages, pull request titles and release notes from the repos you pick. Never your code.</p>
          )}
        </Row>

        <Row
          icon={<PlatformIcon platform="linkedin" className="size-5" />}
          title="LinkedIn"
          status={
            !data.linkedinAvailable ? (
              <Badge variant="neutral" size="sm">
                Not available
              </Badge>
            ) : liActive ? (
              <Badge variant={expiringSoon ? 'warning' : 'success'} size="sm">
                {expiringSoon ? 'Expires soon' : 'Connected'}
              </Badge>
            ) : li ? (
              <Badge variant="danger" size="sm">
                {li.status === 'expired' ? 'Expired' : 'Disconnected'}
              </Badge>
            ) : (
              <Badge variant="neutral" size="sm">
                Not connected
              </Badge>
            )
          }
          actions={
            !data.linkedinAvailable ? undefined : liActive ? (
              <>
                {expiringSoon && (
                  <ButtonLink href={CONNECT_URL} prefetch={false} variant="secondary" size="sm">
                    Reconnect
                  </ButtonLink>
                )}
                <Button variant="ghost" size="sm" onClick={() => setDisconnectOpen(true)}>
                  Disconnect
                </Button>
              </>
            ) : (
              <ButtonLink href={CONNECT_URL} prefetch={false} variant={li ? 'primary' : 'secondary'} size="sm">
                {li ? 'Reconnect LinkedIn' : 'Connect LinkedIn'}
              </ButtonLink>
            )
          }
        >
          {!data.linkedinAvailable ? (
            <p>Direct publishing isn’t set up on this server. Approved posts open in LinkedIn’s composer, ready to post.</p>
          ) : liActive ? (
            <>
              <span className="inline-flex items-center gap-2 text-fg">
                <Avatar src={li?.avatarUrl} name={li?.displayName} size="xs" />
                {li?.displayName ?? 'Your LinkedIn account'}
              </span>
              <p>
                Approved posts publish directly.
                {expiresAt && ` LinkedIn asks you to reconnect every 60 days; this connection lasts until ${formatBillingDate(expiresAt.toISOString())}.`}
              </p>
            </>
          ) : li ? (
            <p>
              LinkedIn ended this connection. Reconnect and scheduled posts publish directly again; until then they wait
              in your queue as ready to post.
            </p>
          ) : (
            <p>Connect once and approved LinkedIn posts publish on schedule. Without it, they open in the composer.</p>
          )}
        </Row>

        <Row
          icon={<PlatformIcon platform="twitter" className="size-5" />}
          title="X"
          status={
            <Badge variant="neutral" size="sm">
              No connection needed
            </Badge>
          }
          actions={
            <ButtonLink href="/extension" variant="secondary" size="sm">
              <Puzzle className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Set up the extension
            </ButtonLink>
          }
        >
          <p>
            X posts open pre-filled in one tap, or the Chrome extension inserts them straight into the composer.
          </p>
        </Row>
      </ul>

      <p className="flex items-center gap-1.5 text-sm text-fg-muted">
        Manage tokens for the Chrome extension on the
        <Link href="/extension" className="inline-flex items-center gap-0.5 rounded-sm font-medium text-accent hover:underline focus-ring">
          Extension page
          <ArrowUpRight className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </p>

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect LinkedIn?</AlertDialogTitle>
            <AlertDialogDescription>
              Scheduled LinkedIn posts won’t publish on their own. They’ll wait in your queue as ready to post, and you
              can post them from the composer or reconnect any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Keep connected</AlertDialogCancel>
            <AlertDialogAction variant="danger" closeOnClick={false} loading={disconnecting} onClick={disconnect}>
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
