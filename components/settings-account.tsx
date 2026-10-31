'use client'

import * as React from 'react'
import { signOut } from 'next-auth/react'
import { LogOut } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button, ButtonLink } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { FormSection } from '@/components/ui/form-section'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
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
import { PlanBadge } from '@/components/billing/plan-badge'
import { daysUntil, formatBillingDate } from '@/components/billing/format'
import type { PlanId, PlanStatus } from '@/lib/billing/catalog'
import { readError } from '@/components/onboarding/client'

export interface AccountPanelProps {
  user: { name: string | null; email: string | null; image: string | null }
  plan: {
    id: PlanId
    status: PlanStatus
    trialEndsAt: string | null
    currentPeriodEnd: string | null
  }
  joinedAt: string | null
}

const CONFIRM_WORD = 'DELETE'

function planLine(plan: AccountPanelProps['plan']): string {
  if (plan.status === 'trialing') {
    const days = daysUntil(plan.trialEndsAt)
    if (days === null) return 'Your Pro trial is running.'
    return days <= 0 ? 'Your Pro trial ends today.' : `Your Pro trial ends in ${days} ${days === 1 ? 'day' : 'days'}.`
  }
  if (plan.status === 'cancelling') {
    const end = formatBillingDate(plan.currentPeriodEnd)
    return end ? `Cancelled. Access continues until ${end}.` : 'Cancelled at the end of this period.'
  }
  if (plan.status === 'past_due') return 'Your last payment failed. Razorpay will retry; update your payment method in Billing.'
  if (plan.id === 'free') return 'One repo and a weekly digest. Upgrade for ship moments and direct LinkedIn publishing.'
  const renews = formatBillingDate(plan.currentPeriodEnd)
  return renews ? `Renews on ${renews}.` : 'Your subscription is active.'
}

export function AccountPanel({ user, plan, joinedAt }: AccountPanelProps) {
  const [signingOut, setSigningOut] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [confirm, setConfirm] = React.useState('')
  const [deleting, setDeleting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const hasPaidPlan = plan.id !== 'free' && plan.status !== 'trialing'

  const onDelete = async () => {
    if (confirm !== CONFIRM_WORD) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch('/api/user', { method: 'DELETE' })
      if (!res.ok) {
        setError(await readError(res, 'Your account wasn’t deleted. Try again.'))
        setDeleting(false)
        return
      }
      await signOut({ callbackUrl: '/' })
    } catch {
      setError('Your account wasn’t deleted. Check your connection and try again.')
      setDeleting(false)
    }
  }

  return (
    <div>
      <FormSection title="Signed in" description="CommitFlex uses your GitHub account to sign in.">
        <div className="flex max-w-xl flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar src={user.image} name={user.name ?? user.email} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-fg">{user.name ?? 'GitHub user'}</p>
              <p className="truncate text-sm text-fg-muted">
                {user.email ?? 'No public email on GitHub'}
                {joinedAt && <span className="text-fg-subtle"> since {formatBillingDate(joinedAt)}</span>}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            loading={signingOut}
            onClick={() => {
              setSigningOut(true)
              void signOut({ callbackUrl: '/' })
            }}
          >
            {!signingOut && <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />}
            Sign out
          </Button>
        </div>
      </FormSection>
      <Separator />

      <FormSection title="Plan" description="Invoices, payment method and cancellation live in Billing.">
        <div className="flex max-w-xl flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <PlanBadge plan={plan.id} status={plan.status} size="md" className="self-start" />
            <p className="text-sm text-fg-muted">{planLine(plan)}</p>
          </div>
          <ButtonLink href="/billing" variant={plan.id === 'free' || plan.status === 'trialing' ? 'primary' : 'secondary'}>
            {plan.id === 'free' || plan.status === 'trialing' ? 'Upgrade' : 'Manage billing'}
          </ButtonLink>
        </div>
      </FormSection>
      <Separator />

      <FormSection
        title="Delete account"
        description="Removes your account, connected repos, drafts, queue and voice profiles. This can’t be undone."
      >
        <div className="flex max-w-xl flex-col gap-4 rounded-lg border border-danger/30 bg-danger-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-fg-muted">
            {hasPaidPlan
              ? 'Your subscription is cancelled immediately and won’t renew. Webhooks on your repos stop working.'
              : 'Webhooks on your repos stop working. Posts already published stay on LinkedIn and X.'}
          </p>
          <Button variant="danger" onClick={() => setOpen(true)} className="shrink-0">
            Delete account
          </Button>
        </div>
      </FormSection>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (deleting) return
          setOpen(next)
          if (!next) {
            setConfirm('')
            setError(null)
          }
        }}
      >
        <AlertDialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void onDelete()
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your CommitFlex account?</AlertDialogTitle>
              <AlertDialogDescription>
                Everything is removed right away: repos, drafts, the queue, voice profiles and extension tokens.
                {hasPaidPlan && ' Your subscription is cancelled and won’t be charged again.'}
              </AlertDialogDescription>
              <Field label={`Type ${CONFIRM_WORD} to confirm`} error={error} className="mt-4">
                <Input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={CONFIRM_WORD}
                />
              </Field>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Keep my account</AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                variant="danger"
                closeOnClick={false}
                loading={deleting}
                disabled={confirm !== CONFIRM_WORD}
              >
                Delete account
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
