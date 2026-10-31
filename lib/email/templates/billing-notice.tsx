import { Heading, Text } from '@react-email/components'
import { EmailButton, EmailLayout, s } from '../components/layout'

export type BillingNoticeKind = 'activated' | 'payment_failed' | 'cancelled' | 'trial_ending' | 'trial_ended'

export interface BillingNoticeEmailProps {
  firstName: string
  kind: BillingNoticeKind
  planName: string
  /** Absolute URL of the billing page. */
  manageUrl: string
  /** Human date, e.g. '14 Nov 2026'. */
  periodEnd?: string | null
  /** trial_ending: what autopilot did during the trial. */
  stats?: { drafted: number; published: number } | null
}

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

const SUBJECT: Record<BillingNoticeKind, string> = {
  activated: 'Your plan is active',
  payment_failed: 'Your payment did not go through',
  cancelled: 'Your subscription is cancelled',
  trial_ending: 'Your trial ends in 3 days',
  trial_ended: 'Your trial has ended',
}

export function billingNoticeSubject(kind: BillingNoticeKind, planName: string): string {
  if (kind === 'activated') return `You're on CommitFlex ${planName}`
  return SUBJECT[kind]
}

export function BillingNoticeEmail(props: BillingNoticeEmailProps) {
  const { kind, planName, periodEnd } = props
  const appUrl = originOf(props.manageUrl)

  let heading = SUBJECT[kind]
  let body: string
  let cta: string
  switch (kind) {
    case 'activated':
      heading = `You're on ${planName}`
      body = `Thanks, ${props.firstName}. ${planName} is active on your account: ship moments, cadence posting and direct LinkedIn publishing are all on.${periodEnd ? ` Your next renewal is on ${periodEnd}.` : ''}`
      cta = 'Manage billing'
      break
    case 'payment_failed':
      body = `Hi ${props.firstName}, the latest payment for ${planName} didn't go through. Razorpay will retry automatically, and your plan stays active meanwhile. Check your payment method so autopilot keeps running.`
      cta = 'Update payment'
      break
    case 'cancelled':
      body = periodEnd
        ? `Hi ${props.firstName}, your ${planName} subscription is cancelled. You keep ${planName} until ${periodEnd}, then your account moves to Free. Your drafts, queue and settings stay as they are.`
        : `Hi ${props.firstName}, your ${planName} subscription is cancelled and your account is on Free. Your drafts, queue and settings stay as they are.`
      cta = 'Resubscribe'
      break
    case 'trial_ending': {
      const s1 = props.stats
      const did =
        s1 && (s1.drafted > 0 || s1.published > 0)
          ? ` So far autopilot wrote ${s1.drafted} ${s1.drafted === 1 ? 'draft' : 'drafts'} and published ${s1.published} ${s1.published === 1 ? 'post' : 'posts'} for you.`
          : ''
      body = `Hi ${props.firstName}, your Pro trial ends${periodEnd ? ` on ${periodEnd}` : ' in 3 days'}.${did} Upgrade to keep ship-moment drafts, your posting cadence and direct LinkedIn publishing.`
      cta = 'Upgrade to Pro'
      break
    }
    case 'trial_ended':
      body = `Hi ${props.firstName}, your Pro trial has ended and your account is on Free. You keep the weekly digest, the queue and the extension. Ship-moment drafts, cadence posting and direct LinkedIn publishing are paused until you upgrade. Nothing was deleted.`
      cta = 'Upgrade to Pro'
      break
  }

  return (
    <EmailLayout appUrl={appUrl} preview={heading}>
      <Heading as="h1" style={s.h1}>
        {heading}
      </Heading>
      <Text style={s.p}>{body}</Text>
      <EmailButton href={props.manageUrl}>{cta}</EmailButton>
    </EmailLayout>
  )
}

export default BillingNoticeEmail
