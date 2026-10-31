'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
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
import { toast } from '@/components/ui/toast'
import { formatBillingDate } from './format'
import { invalidateBillingStatus } from './use-billing-status'

export interface CancelSubscriptionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  planName: string
  /** ISO end of the paid period; access continues until then. */
  periodEnd: string | null
}

/** Confirms a cancel-at-period-end. Nothing is deleted; the plan falls back to Free afterwards. */
export function CancelSubscriptionDialog({ open, onOpenChange, planName, periodEnd }: CancelSubscriptionDialogProps) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const endLabel = formatBillingDate(periodEnd)

  async function cancel() {
    setPending(true)
    try {
      const res = await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ atPeriodEnd: true }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; currentPeriodEnd?: string | null }
      if (!res.ok) {
        toast.error("Your subscription wasn't cancelled", { description: body.error ?? 'Try again in a minute.' })
        return
      }
      const until = formatBillingDate(body.currentPeriodEnd ?? periodEnd)
      invalidateBillingStatus()
      toast.success('Subscription cancelled', {
        description: until ? `You keep ${planName} until ${until}.` : `You're on Free now.`,
      })
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error("Your subscription wasn't cancelled", { description: 'Check your connection and try again.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {planName}?</AlertDialogTitle>
          <AlertDialogDescription>
            {endLabel ? `You keep ${planName} until ${endLabel}. ` : ''}
            After that your account moves to Free. Ship moments, cadence and direct LinkedIn publishing stop; the weekly
            digest keeps running. Your drafts, queue and repos stay as they are.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep {planName}</AlertDialogCancel>
          <AlertDialogAction variant="danger" closeOnClick={false} loading={pending} onClick={cancel}>
            Cancel subscription
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
