import type { ReactNode } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Section } from '@/components/landing/section'
import { PLANS, TRIAL_DAYS, formatPrice } from '@/lib/billing/catalog'

export interface FaqItem {
  q: string
  a: ReactNode
}

/** Native <details> disclosure list: keyboard and screen-reader friendly with no JavaScript. */
export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-left focus-ring-inset [&::-webkit-details-marker]:hidden">
            <span className="text-base font-medium text-fg">{item.q}</span>
            <Plus
              className="mt-0.5 size-4 shrink-0 text-fg-subtle transition-transform duration-180 ease-out group-open:rotate-45"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </summary>
          <div className="max-w-prose pb-6 pr-10 text-base text-fg-muted">{item.a}</div>
        </details>
      ))}
    </div>
  )
}

const inlineLink = 'rounded-sm text-accent underline-offset-4 hover:underline focus-ring'

export const LANDING_FAQ: FaqItem[] = [
  {
    q: 'Will CommitFlex post without asking me?',
    a: 'Not unless you tell it to. By default every draft is emailed to you with an Approve link, and nothing goes out until you approve it. On Pro you can switch to automatic posting, where CommitFlex posts at the scheduled time and tells you afterwards.',
  },
  {
    q: 'What does it read from my repositories?',
    a: 'Commit messages, pull request titles and descriptions, release notes and line counts, from the repos you pick and nothing else. It never fetches file contents or diffs, so your source code is never stored or sent to an AI model.',
  },
  {
    q: 'Why can’t it post to X directly like it does on LinkedIn?',
    a: 'LinkedIn offers an official API for posting on your behalf, so CommitFlex uses it. For X, CommitFlex opens the post pre-filled so you only press Post, and the Chrome extension can insert the text straight into the X composer.',
  },
  {
    q: 'What happens in a week where I don’t ship anything?',
    a: 'Nothing. CommitFlex only writes about work that exists in your commits. If there were no merged pull requests, releases or meaningful commits, the slot stays empty.',
  },
  {
    q: 'Can I edit a draft before it goes out?',
    a: 'Yes. Open any draft from the email or the queue to edit it, regenerate it, or on Pro ask for a few alternative versions. Approving locks in exactly the text you see. LinkedIn posts go out on their own; X posts open pre-filled for you to press Post.',
  },
  {
    q: 'Does it work for private repositories and organisations?',
    a: 'Yes, for any repository your GitHub account can read. If an organisation restricts third-party apps, an owner has to approve CommitFlex in the organisation settings first.',
  },
  {
    q: 'What does it cost?',
    a: (
      <>
        There is a free plan for one repo and a weekly digest. Pro is {formatPrice(PLANS.pro.prices.INR.month, 'INR')} or{' '}
        {formatPrice(PLANS.pro.prices.USD.month, 'USD')} a month, and every new account gets {TRIAL_DAYS} days of Pro
        without a card. The{' '}
        <Link href="/pricing" className={inlineLink}>
          pricing page
        </Link>{' '}
        has the details.
      </>
    ),
  },
]

export function Faq({ items = LANDING_FAQ, title = 'Questions people ask first' }: { items?: FaqItem[]; title?: string }) {
  return (
    <Section id="faq" title={title}>
      <FaqList items={items} />
    </Section>
  )
}
