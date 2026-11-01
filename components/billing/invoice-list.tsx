'use client'

import * as React from 'react'
import { ExternalLink, ReceiptText } from 'lucide-react'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatAmount, formatBillingDate } from './format'
import type { InvoiceView } from './types'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; invoices: InvoiceView[]; partial: boolean }

const STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  paid: { label: 'Paid', variant: 'success' },
  issued: { label: 'Due', variant: 'warning' },
  partially_paid: { label: 'Partly paid', variant: 'warning' },
  expired: { label: 'Expired', variant: 'neutral' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
  draft: { label: 'Draft', variant: 'neutral' },
}

function statusMeta(status: string) {
  return STATUS[status] ?? { label: status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), variant: 'neutral' as const }
}

/** Razorpay invoices for the signed-in user, loaded after the page renders. */
export function InvoiceList({ hasPaidHistory }: { hasPaidHistory: boolean }) {
  const [state, setState] = React.useState<LoadState>(() =>
    hasPaidHistory ? { kind: 'loading' } : { kind: 'ready', invoices: [], partial: false },
  )
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    if (!hasPaidHistory) return
    let alive = true
    setState({ kind: 'loading' })
    fetch('/api/billing/invoices', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { invoices?: InvoiceView[]; partial?: boolean; error?: string }
        if (!alive) return
        if (!res.ok) {
          setState({ kind: 'error', message: body.error ?? "Razorpay didn't return your invoices. Try again in a minute." })
          return
        }
        setState({ kind: 'ready', invoices: body.invoices ?? [], partial: !!body.partial })
      })
      .catch(() => {
        if (alive) setState({ kind: 'error', message: 'Check your connection and try again.' })
      })
    return () => {
      alive = false
    }
  }, [hasPaidHistory, attempt])

  if (state.kind === 'loading') {
    return (
      <div className="overflow-hidden rounded-lg border border-line bg-surface" aria-busy="true" aria-label="Loading invoices">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-b-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
        ))}
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-lg border border-line bg-surface px-4 sm:px-5">
        <ErrorState
          title="Invoices didn't load"
          description={state.message}
          onRetry={() => setAttempt((n) => n + 1)}
          className="py-6"
        />
      </div>
    )
  }

  if (state.invoices.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface px-4 sm:px-5">
        <EmptyState
          size="sm"
          icon={ReceiptText}
          title="No invoices yet"
          description="Razorpay issues an invoice for every payment. They show up here after your first charge."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Invoice link</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {state.invoices.map((invoice) => {
            const meta = statusMeta(invoice.status)
            return (
              <TableRow key={invoice.id}>
                <TableCell label="Date" className="whitespace-nowrap tabular-nums">
                  {formatBillingDate(invoice.date) ?? 'Pending'}
                </TableCell>
                <TableCell label="Plan" className="text-fg-muted">
                  {invoice.description}
                </TableCell>
                <TableCell label="Amount" className="text-right tabular-nums">
                  {formatAmount(invoice.amount, invoice.currency)}
                </TableCell>
                <TableCell label="Status">
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {invoice.url ? (
                    <a
                      href={invoice.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-accent underline-offset-4 hover:underline focus-ring"
                    >
                      View invoice
                      <ExternalLink className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                      <span className="sr-only">(opens Razorpay in a new tab)</span>
                    </a>
                  ) : (
                    <span className="text-sm text-fg-subtle">No link</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {state.partial && (
        <p className="text-xs text-fg-subtle">Some older invoices couldn’t be loaded from Razorpay right now.</p>
      )}
    </div>
  )
}
