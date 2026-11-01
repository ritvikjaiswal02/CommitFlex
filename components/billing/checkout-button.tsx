'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { PLANS, type BillingInterval, type Currency, type PaidPlanId } from '@/lib/billing/catalog'
import { cn } from '@/lib/utils'
import { CHECKOUT_THEME_COLOR, loadRazorpayCheckout, type RazorpaySuccessResponse } from './razorpay-checkout'
import type { CheckoutResponse } from './types'
import { invalidateBillingStatus } from './use-billing-status'

export interface CheckoutButtonProps {
  plan: PaidPlanId
  interval: BillingInterval
  currency?: Currency
  children?: React.ReactNode
  className?: string
  variant?: 'primary' | 'secondary'
  size?: 'md' | 'lg'
  fullWidth?: boolean
  onSuccess?: () => void
  /** Stored in the Razorpay subscription notes, e.g. 'billing' or 'upgrade-dialog'. */
  source?: string
  disabled?: boolean
  /**
   * Called right before the Razorpay modal opens. A dialog hosting the button
   * should close here so its focus trap doesn't fight Razorpay's iframe.
   */
  onCheckoutOpen?: () => void
}

type Phase = 'idle' | 'starting' | 'paying' | 'confirming'

interface ErrorBody {
  error?: string
  code?: string
}

async function readError(res: Response): Promise<ErrorBody> {
  try {
    return (await res.json()) as ErrorBody
  } catch {
    return {}
  }
}

/**
 * Starts a Razorpay subscription checkout for a plan.
 * Signed-out visitors go to /login?next=/pricing. On success the payment is
 * verified server-side, the plan applies immediately and the page refreshes.
 */
export function CheckoutButton({
  plan,
  interval,
  currency,
  children,
  className,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  onSuccess,
  source,
  disabled,
  onCheckoutOpen,
}: CheckoutButtonProps) {
  const router = useRouter()
  const [phase, setPhase] = React.useState<Phase>('idle')
  const mounted = React.useRef(true)
  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const set = (next: Phase) => {
    if (mounted.current) setPhase(next)
  }

  const planName = PLANS[plan].name

  async function confirm(response: RazorpaySuccessResponse) {
    set('confirming')
    // The button may have unmounted (a dialog closes when Razorpay opens), so progress lives in a toast.
    const progress = toast('Confirming your payment', { duration: 0 })
    try {
      const res = await fetch('/api/billing/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      })
      if (!res.ok) {
        const body = await readError(res)
        toast.error("We couldn't confirm your payment", {
          description: body.error ?? 'If you were charged, your plan updates within a few minutes.',
        })
        return
      }
      invalidateBillingStatus()
      toast.success(`You're on ${planName}`, {
        description: 'Ship moments, cadence and direct LinkedIn publishing are on.',
      })
      router.refresh()
      onSuccess?.()
    } catch {
      toast.error("We couldn't confirm your payment", {
        description: 'Check your connection. If you were charged, your plan updates within a few minutes.',
      })
    } finally {
      toast.dismiss(progress)
      set('idle')
    }
  }

  async function start() {
    if (phase !== 'idle') return
    set('starting')
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval, ...(currency ? { currency } : {}), ...(source ? { source } : {}) }),
      })

      if (res.status === 401) {
        set('idle')
        router.push('/login?next=/pricing')
        return
      }
      if (!res.ok) {
        const body = await readError(res)
        set('idle')
        if (body.code === 'already_subscribed') {
          toast.info(body.error ?? `You're already on ${planName}`)
        } else if (body.code === 'not_configured') {
          toast.error("Payments aren't available right now", {
            description: 'Checkout is not set up on this deployment yet.',
          })
        } else {
          toast.error("Checkout didn't open", { description: body.error ?? 'Try again in a minute.' })
        }
        return
      }

      const order = (await res.json()) as CheckoutResponse
      const Razorpay = await loadRazorpayCheckout()
      set('paying')

      const checkout = new Razorpay({
        key: order.keyId,
        subscription_id: order.subscriptionId,
        name: order.name,
        description: order.description,
        prefill: order.prefill,
        notes: { plan: order.plan, interval: order.interval },
        theme: { color: CHECKOUT_THEME_COLOR },
        handler: (response) => {
          void confirm(response)
        },
        modal: {
          ondismiss: () => set('idle'),
          confirm_close: true,
        },
      })
      checkout.on('payment.failed', (response) => {
        toast.error('Payment failed', {
          description: response.error?.description ?? 'Razorpay declined the payment. Try another method.',
        })
      })
      onCheckoutOpen?.()
      checkout.open()
    } catch (err) {
      set('idle')
      toast.error("Checkout didn't open", {
        description:
          err instanceof Error && err.message.includes('Razorpay')
            ? `${err.message}. Check your connection or ad blocker and try again.`
            : 'Check your connection and try again.',
      })
    }
  }

  const label =
    phase === 'confirming' ? 'Confirming payment' : phase === 'starting' ? 'Opening checkout' : children ?? `Upgrade to ${planName}`

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      loading={phase === 'starting' || phase === 'confirming'}
      disabled={disabled || phase === 'paying'}
      onClick={start}
      className={cn(fullWidth && 'w-full', className)}
      data-plan={plan}
      data-interval={interval}
    >
      {label}
    </Button>
  )
}
