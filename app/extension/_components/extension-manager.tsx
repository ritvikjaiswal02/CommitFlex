'use client'

import * as React from 'react'
import { CircleCheck, KeyRound, Plug, Puzzle, RefreshCw, TriangleAlert, Unplug } from 'lucide-react'
import type { ApiTokenSummary } from '@/lib/db/queries/tokens'
import { Button, buttonVariants } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import { useUpgrade } from '@/components/billing/upgrade-provider'
import { cn } from '@/lib/utils'
import { useExtensionBridge, type BridgeState } from './use-extension-bridge'
import { TokenTable } from './token-table'
import { ManualTokenDialog } from './manual-token-dialog'

export interface ExtensionManagerProps {
  initialTokens: ApiTokenSummary[]
  limit: { used: number; max: number }
  appUrl: string
  storeUrl: string | null
  user: { email: string | null; name: string | null }
}

type Busy = null | 'connect' | 'disconnect'

interface CreatedToken {
  token: string
  summary: ApiTokenSummary
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown }
    return typeof body.error === 'string' && body.error ? body.error : fallback
  } catch {
    return fallback
  }
}

export function ExtensionManager({ initialTokens, limit, appUrl, storeUrl, user }: ExtensionManagerProps) {
  const bridge = useExtensionBridge()
  const { handlePlanError } = useUpgrade()
  const [tokens, setTokens] = React.useState(initialTokens)
  const [busy, setBusy] = React.useState<Busy>(null)
  const [error, setError] = React.useState<string | null>(null)
  // Which action failed, so the error says what didn't happen.
  const [errorAction, setErrorAction] = React.useState<'connect' | 'disconnect' | 'token'>('connect')
  const [manualOpen, setManualOpen] = React.useState(false)

  const max = limit.max
  const used = tokens.length
  const extensionPrefix = bridge.state.phase === 'present' ? bridge.state.tokenPrefix : null

  /** Creates a token. Returns null (and has already told the user) when it fails. */
  const createToken = React.useCallback(
    async (name?: string): Promise<CreatedToken | null> => {
      if (name !== undefined) setErrorAction('token')
      let res: Response
      try {
        res = await fetch('/api/extension/tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(name ? { name } : {}),
        })
      } catch {
        setError('CommitFlex could not be reached. Check your connection and try again.')
        return null
      }
      if (res.status === 402) {
        const handled = await handlePlanError(res)
        if (!handled) setError(await readError(res, 'Your plan has no room for another token. Revoke one, or upgrade.'))
        return null
      }
      if (!res.ok) {
        setError(await readError(res, 'CommitFlex could not create a token. Try again in a moment.'))
        return null
      }
      const created = (await res.json()) as CreatedToken
      setTokens((current) => [created.summary, ...current.filter((t) => t.id !== created.summary.id)])
      return created
    },
    [handlePlanError],
  )

  const revokeToken = React.useCallback(async (tokenId: string, opts: { silent?: boolean } = {}) => {
    let res: Response
    try {
      res = await fetch(`/api/extension/tokens/${tokenId}`, { method: 'DELETE' })
    } catch {
      if (!opts.silent) toast.error('Could not revoke the token', { description: 'CommitFlex could not be reached. Try again.' })
      return false
    }
    if (!res.ok && res.status !== 404) {
      if (!opts.silent) {
        toast.error('Could not revoke the token', { description: await readError(res, 'Try again in a moment.') })
      }
      return false
    }
    setTokens((current) => current.filter((t) => t.id !== tokenId))
    if (!opts.silent) toast.success('Token revoked', { description: 'Any browser using it is signed out of CommitFlex.' })
    return true
  }, [])

  const connect = async () => {
    setError(null)
    setErrorAction('connect')
    setBusy('connect')
    const previousPrefix = extensionPrefix
    try {
      const created = await createToken()
      if (!created) return
      try {
        await bridge.connect(created.token, appUrl)
      } catch (err) {
        // The extension never took the token, so don't leave it lying around.
        await revokeToken(created.summary.id, { silent: true })
        setError(err instanceof Error ? err.message : 'The extension could not be connected.')
        return
      }
      if (previousPrefix && previousPrefix !== created.summary.tokenPrefix) {
        const old = tokens.find((t) => t.tokenPrefix === previousPrefix)
        if (old) await revokeToken(old.id, { silent: true })
      }
      toast.success('Extension connected', {
        description: user.email ? `Signed in as ${user.email}.` : 'Your queue now shows up in LinkedIn and X.',
      })
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    setError(null)
    setErrorAction('disconnect')
    setBusy('disconnect')
    const prefix = extensionPrefix
    try {
      await bridge.disconnect()
      const held = prefix ? tokens.find((t) => t.tokenPrefix === prefix) : undefined
      if (held) await revokeToken(held.id, { silent: true })
      toast.success('Extension disconnected', { description: 'Its token was revoked.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The extension could not be disconnected.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="connection-title" className="flex flex-col gap-3">
        <h2 id="connection-title" className="sr-only">
          Connection
        </h2>
        <ConnectionPanel
          state={bridge.state}
          busy={busy}
          sessionEmail={user.email}
          storeUrl={storeUrl}
          onConnect={connect}
          onDisconnect={disconnect}
          onManual={() => setManualOpen(true)}
        />
        {error && (
          <Callout
            tone="danger"
            title={
              errorAction === 'disconnect'
                ? "The extension didn't disconnect"
                : errorAction === 'token'
                  ? "The token wasn't created"
                  : "The extension didn't connect"
            }
          >
            {error}
          </Callout>
        )}
      </section>

      <TokenTable
        tokens={tokens}
        used={used}
        max={max}
        extensionPrefix={extensionPrefix}
        onRevoke={(id) => revokeToken(id)}
        onCreate={() => setManualOpen(true)}
      />

      <ManualTokenDialog open={manualOpen} onOpenChange={setManualOpen} createToken={createToken} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

interface ConnectionPanelProps {
  state: BridgeState
  busy: Busy
  sessionEmail: string | null
  storeUrl: string | null
  onConnect: () => void
  onDisconnect: () => void
  onManual: () => void
}

function PanelShell({
  icon: Icon,
  tone,
  title,
  children,
  actions,
}: {
  icon: typeof Puzzle
  tone: 'neutral' | 'success' | 'warning'
  title: string
  children?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-start sm:p-5">
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg',
          tone === 'success' && 'bg-success-soft text-success',
          tone === 'warning' && 'bg-warning-soft text-warning',
          tone === 'neutral' && 'bg-sunken text-fg-muted',
        )}
      >
        <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-base font-semibold text-fg">{title}</p>
        {children && <div className="max-w-prose text-sm text-fg-muted">{children}</div>}
        {actions && <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

function ConnectionPanel({ state, busy, sessionEmail, storeUrl, onConnect, onDisconnect, onManual }: ConnectionPanelProps) {
  if (state.phase === 'detecting') {
    return (
      <div
        className="flex items-start gap-4 rounded-lg border border-line bg-surface p-4 sm:p-5"
        aria-busy="true"
        aria-label="Looking for the extension"
      >
        <Skeleton className="size-10 rounded-lg" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3.5 w-full max-w-md" />
        </div>
      </div>
    )
  }

  if (state.phase === 'missing') {
    return (
      <PanelShell
        icon={Puzzle}
        tone="neutral"
        title="Install the extension in this browser"
        actions={
          <>
            {storeUrl ? (
              <a
                href={storeUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: 'primary' })}
              >
                Add to Chrome
              </a>
            ) : (
              <a
                href="#install"
                className={buttonVariants({ variant: 'primary' })}
              >
                See install steps
              </a>
            )}
            <Button variant="ghost" onClick={onManual}>
              <KeyRound strokeWidth={1.75} aria-hidden="true" />
              Use a token instead
            </Button>
          </>
        }
      >
        CommitFlex wasn&apos;t found in this browser. Install it, reload this page, and connect it here. Using another
        browser? Create a token and paste it into the extension&apos;s settings.
      </PanelShell>
    )
  }

  const accountEmail = state.account?.email ?? null
  const otherAccount =
    state.connected && accountEmail && sessionEmail && accountEmail.toLowerCase() !== sessionEmail.toLowerCase()

  if (!state.connected) {
    return (
      <PanelShell
        icon={Plug}
        tone="neutral"
        title="Connect the extension to your account"
        actions={
          <>
            <Button onClick={onConnect} loading={busy === 'connect'}>
              Connect extension
            </Button>
            <Button variant="ghost" onClick={onManual} disabled={busy !== null}>
              <KeyRound strokeWidth={1.75} aria-hidden="true" />
              Use a token instead
            </Button>
          </>
        }
      >
        This creates a token for this browser and hands it to the extension, so there&apos;s nothing to copy. Version{' '}
        {state.version} is installed.
      </PanelShell>
    )
  }

  if (otherAccount) {
    return (
      <PanelShell
        icon={TriangleAlert}
        tone="warning"
        title={`The extension is signed in as ${accountEmail}`}
        actions={
          <>
            <Button onClick={onConnect} loading={busy === 'connect'}>
              Connect this account instead
            </Button>
            <Button variant="ghost" onClick={onDisconnect} loading={busy === 'disconnect'} disabled={busy === 'connect'}>
              <Unplug strokeWidth={1.75} aria-hidden="true" />
              Disconnect
            </Button>
          </>
        }
      >
        You&apos;re signed in to CommitFlex as {sessionEmail}. Drafts in the composer come from the account the
        extension is connected to.
      </PanelShell>
    )
  }

  return (
    <PanelShell
      icon={CircleCheck}
      tone="success"
      title={accountEmail ? `Connected as ${accountEmail}` : 'Extension connected'}
      actions={
        <>
          <Button variant="secondary" onClick={onConnect} loading={busy === 'connect'} disabled={busy === 'disconnect'}>
            <RefreshCw strokeWidth={1.75} aria-hidden="true" />
            Reconnect
          </Button>
          <Button variant="ghost" onClick={onDisconnect} loading={busy === 'disconnect'} disabled={busy === 'connect'}>
            <Unplug strokeWidth={1.75} aria-hidden="true" />
            Disconnect
          </Button>
        </>
      }
    >
      Open a post composer on LinkedIn or X and the CommitFlex button appears in its corner. Version {state.version}.
    </PanelShell>
  )
}
