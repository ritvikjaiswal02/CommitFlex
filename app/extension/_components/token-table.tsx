'use client'

import * as React from 'react'
import { KeyRound, Plus, Trash2 } from 'lucide-react'
import type { ApiTokenSummary } from '@/lib/db/queries/tokens'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { UsageMeter } from '@/components/billing/usage-meter'
import { absoluteDate, relativeDate } from './format'

export interface TokenTableProps {
  tokens: ApiTokenSummary[]
  used: number
  max: number
  /** Prefix of the token the extension in this browser holds. */
  extensionPrefix: string | null
  onRevoke: (tokenId: string) => Promise<boolean>
  onCreate: () => void
}

export function TokenTable({ tokens, used, max, extensionPrefix, onRevoke, onCreate }: TokenTableProps) {
  const [confirming, setConfirming] = React.useState<ApiTokenSummary | null>(null)
  const [revoking, setRevoking] = React.useState(false)
  const atLimit = max > 0 && used >= max

  const confirmRevoke = async () => {
    if (!confirming) return
    setRevoking(true)
    try {
      const ok = await onRevoke(confirming.id)
      if (ok) setConfirming(null)
    } finally {
      setRevoking(false)
    }
  }

  return (
    <section aria-labelledby="tokens-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="tokens-title" className="text-xl font-semibold text-fg">
            Tokens
          </h2>
          <p className="max-w-prose text-sm text-fg-muted">
            Each browser gets its own token. Revoke one to sign that browser out of CommitFlex.
          </p>
        </div>
        <Button variant="secondary" onClick={onCreate} className="self-start sm:self-auto">
          <Plus strokeWidth={1.75} aria-hidden="true" />
          Create token
        </Button>
      </div>

      <UsageMeter label="Extension tokens" used={used} max={max} unit="tokens" showUpgrade={atLimit} className="max-w-sm" />

      {tokens.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface px-4 sm:px-5">
          <EmptyState
            size="sm"
            icon={KeyRound}
            title="No tokens yet"
            description="Connecting the extension creates a token for this browser. Create one by hand for a browser where the page can't reach the extension."
          />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-0 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.map((token) => {
              const lastUsed = relativeDate(token.lastUsedAt)
              const isThisBrowser = extensionPrefix !== null && token.tokenPrefix === extensionPrefix
              return (
                <TableRow key={token.id}>
                  <TableCell className="font-medium md:max-w-[240px]">
                    <span className="flex min-w-0 items-center gap-2 max-md:w-full max-md:justify-between">
                      <span className="truncate">{token.name}</span>
                      {isThisBrowser && (
                        <Badge variant="accent" className="shrink-0">
                          This browser
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell label="Token">
                    <code className="font-mono text-xs text-fg-muted">{token.tokenPrefix}…</code>
                  </TableCell>
                  <TableCell label="Last used" className="tabular-nums text-fg-muted">
                    {lastUsed ? (
                      <time dateTime={token.lastUsedAt ?? undefined} title={absoluteDate(token.lastUsedAt!)}>
                        {lastUsed}
                      </time>
                    ) : (
                      'Never'
                    )}
                  </TableCell>
                  <TableCell label="Created" className="tabular-nums text-fg-muted">
                    <time dateTime={token.createdAt} title={absoluteDate(token.createdAt)}>
                      {relativeDate(token.createdAt)}
                    </time>
                  </TableCell>
                  <TableCell className="text-right max-md:justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirming(token)}
                      aria-label={`Revoke ${token.name}`}
                    >
                      <Trash2 strokeWidth={1.75} aria-hidden="true" />
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && !revoking && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {confirming?.name ?? 'this token'}?</AlertDialogTitle>
            <AlertDialogDescription>
              The browser using it stops showing your queue right away. You can connect it again later with a new
              token.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Keep token</AlertDialogCancel>
            <AlertDialogAction variant="danger" closeOnClick={false} loading={revoking} onClick={confirmRevoke}>
              Revoke token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
