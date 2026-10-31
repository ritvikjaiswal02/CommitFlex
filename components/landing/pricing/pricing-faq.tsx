import Link from 'next/link'
import type { FaqItem } from '@/components/landing/faq'
import { PLANS, TRIAL_DAYS } from '@/lib/billing/catalog'

const inlineLink = 'rounded-sm text-accent underline-offset-4 hover:underline focus-ring'

export const PRICING_FAQ: FaqItem[] = [
  {
    q: 'How does the free trial work?',
    a: `Every new account gets ${TRIAL_DAYS} days of Pro, starting the first time you open onboarding. There is no card to enter and nothing to cancel. You get one trial per account, and you can subscribe at any point during it.`,
  },
  {
    q: 'What happens when the trial ends?',
    a: `Your account moves to Free on its own. Nothing is deleted: drafts, voice profiles and queued posts stay. Autopilot keeps watching your first repo and the weekly digest keeps running, while drafts from merged pull requests, releases and your cadence pause until you subscribe.`,
  },
  {
    q: 'What counts as a draft?',
    a: `Each run that writes posts counts once, whether autopilot started it or you did. Regenerating a single draft or asking for alternative versions also counts once. The count resets on the first of every month (UTC). Free includes ${PLANS.free.limits.generationsPerMonth} a month, Pro ${PLANS.pro.limits.generationsPerMonth} and Team ${PLANS.team.limits.generationsPerMonth}.`,
  },
  {
    q: 'Can I switch plans or move to yearly billing?',
    a: 'Yes. Choose the plan and billing period you want on this page and pay for it. As soon as the new subscription is active, the previous one is cancelled. Payments already made are not prorated.',
  },
  {
    q: 'How do I cancel?',
    a: 'From the billing page, in one click. You keep everything you paid for until the end of the current period, then the account moves to Free. Your data stays.',
  },
  {
    q: 'Which currencies and payment methods do you accept?',
    a: 'Indian rupees with UPI or a card, and US dollars with a card. Payments are handled by Razorpay, so CommitFlex never sees your card details. We pick a currency from your location, and you can switch it above.',
  },
  {
    q: 'What do Team reviewers do?',
    a: `On Team you can add up to ${PLANS.team.limits.reviewers} reviewer email addresses. Each draft is emailed to them as well as to you, and any of them can approve it with one click. Reviewers don't need their own CommitFlex account.`,
  },
  {
    q: 'Do you offer refunds?',
    a: (
      <>
        The{' '}
        <Link href="/terms#refunds" className={inlineLink}>
          cancellation and refunds section
        </Link>{' '}
        of our terms explains when we refund a payment and how to ask for one.
      </>
    ),
  },
]
