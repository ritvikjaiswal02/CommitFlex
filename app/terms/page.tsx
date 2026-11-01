import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/auth'
import { MarketingShell } from '@/components/landing/marketing-shell'
import { ContactLine, LegalPage, P, Term, UL, linkClass, type LegalSection } from '@/components/landing/legal'
import { PLANS, TRIAL_DAYS, formatPrice } from '@/lib/billing/catalog'

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The agreement between you and CommitFlex, including billing, cancellation and refunds.',
}

const UPDATED = '2026-11-01'

const price = (plan: 'pro' | 'team') =>
  `${formatPrice(PLANS[plan].prices.INR.month, 'INR')} or ${formatPrice(PLANS[plan].prices.USD.month, 'USD')} a month`

const SECTIONS: LegalSection[] = [
  {
    id: 'agreement',
    title: 'Agreement',
    body: (
      <P>
        These terms are an agreement between you and CommitFlex (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an
        account or using CommitFlex you accept them. If you use CommitFlex for an organisation, you confirm you are
        allowed to accept these terms for it. Our{' '}
        <Link href="/privacy" className={linkClass}>
          privacy policy
        </Link>{' '}
        explains how we handle your data.
      </P>
    ),
  },
  {
    id: 'service',
    title: 'What CommitFlex does',
    body: (
      <P>
        CommitFlex reads activity from GitHub repositories you connect, writes social media drafts about it with the
        help of AI models, schedules those drafts, and publishes or hands them off to LinkedIn and X according to your
        settings. Features differ by plan, as described on the{' '}
        <Link href="/pricing" className={linkClass}>
          pricing page
        </Link>
        .
      </P>
    ),
  },
  {
    id: 'account',
    title: 'Your account',
    body: (
      <UL>
        <li>You sign in with GitHub and must be at least 16 years old.</li>
        <li>You are responsible for activity on your account and for keeping your GitHub account and extension tokens secure.</li>
        <li>Tell us promptly if you think someone has accessed your account without permission.</li>
      </UL>
    ),
  },
  {
    id: 'content',
    title: 'Your content and what gets posted',
    body: (
      <>
        <P>
          You own your repositories, your writing samples and the posts CommitFlex drafts for you. You give us
          permission to store and process them only as needed to run CommitFlex for you.
        </P>
        <P>
          <Term>You are responsible for what is published under your name.</Term> AI-written drafts can be wrong or
          describe your work inaccurately, so read them before approving. If you turn on automatic posting, you accept
          that drafts will be published at their scheduled time without your review, and you can skip or edit anything
          in the queue before then.
        </P>
        <P>
          Only connect repositories you are allowed to describe publicly. Don&apos;t use CommitFlex to publish
          confidential information belonging to an employer or client.
        </P>
      </>
    ),
  },
  {
    id: 'platforms',
    title: 'GitHub, LinkedIn and X',
    body: (
      <P>
        CommitFlex is not affiliated with or endorsed by GitHub, LinkedIn or X. Your use of those services is governed
        by their own terms, which you must follow when CommitFlex acts for you. They can change or limit their APIs at
        any time. If that stops a feature from working, we will tell you and do our best to offer an alternative, such
        as handing the post to you to publish yourself.
      </P>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <P>Don&apos;t use CommitFlex to:</P>
        <UL>
          <li>publish spam, misleading content, or content that is unlawful, harassing or infringes someone else&apos;s rights;</li>
          <li>post on behalf of anyone without their permission;</li>
          <li>get around plan limits, share accounts, or resell the service;</li>
          <li>probe, overload or interfere with CommitFlex or the platforms it connects to.</li>
        </UL>
      </>
    ),
  },
  {
    id: 'billing',
    title: 'Plans, trials and billing',
    body: (
      <>
        <P>
          <Term>Free plan.</Term> Free has the limits shown on the pricing page and does not require payment details.
        </P>
        <P>
          <Term>Trial.</Term> Each new account gets one {TRIAL_DAYS}-day Pro trial with no card required. When it ends
          the account moves to Free unless you have subscribed.
        </P>
        <P>
          <Term>Paid plans.</Term> Pro costs {price('pro')} and Team costs {price('team')}, or ten times the monthly price
          when billed yearly. Prices are shown before you pay and include any taxes we are required to collect.
          Subscriptions renew automatically at the end of each period until you cancel, and are charged through
          Razorpay using the payment method you authorise.
        </P>
        <P>
          <Term>Changing plans.</Term> When you subscribe to a different plan or billing period, your previous
          subscription is cancelled as soon as the new one is active. Payments already made are not prorated.
        </P>
        <P>
          <Term>Failed payments.</Term> If a renewal fails, Razorpay retries it and we email you. If payment still
          can&apos;t be collected, the subscription stops and your account moves to Free.
        </P>
        <P>
          <Term>Price changes.</Term> We will email you at least 30 days before a price change affects your
          subscription. The new price applies from your next renewal after that notice.
        </P>
        <P>
          <Term>Moving to a lower plan.</Term> Nothing is deleted. Repositories beyond the new limit stop being watched
          by autopilot, and queued posts beyond the limit stay in the queue, but new posts can&apos;t be queued until you
          are back under it.
        </P>
      </>
    ),
  },
  {
    id: 'refunds',
    title: 'Cancellation and refunds',
    body: (
      <>
        <P>
          You can cancel a subscription at any time from the billing page. Cancellation takes effect at the end of the
          period you have paid for, and you keep paid features until then. After that the account moves to Free and
          your data stays.
        </P>
        <P>We refund a payment in full when:</P>
        <UL>
          <li>you were charged for a renewal you had already cancelled, or charged twice for the same period;</li>
          <li>you ask within 7 days of your first payment for a plan and haven&apos;t used it to publish posts; or</li>
          <li>CommitFlex was unavailable or broken for a large part of the period in a way we couldn&apos;t fix.</li>
        </UL>
        <P>
          Otherwise payments are non-refundable, and partial periods are not refunded. To ask for a refund, contact us
          with the email address on your account. Approved refunds go back to the original payment method through
          Razorpay, usually within 5 to 7 working days.
        </P>
      </>
    ),
  },
  {
    id: 'availability',
    title: 'Availability and changes',
    body: (
      <P>
        We work to keep CommitFlex running and publishing on time, but we don&apos;t guarantee it will be uninterrupted
        or that every post will go out at its exact scheduled minute. We may change or remove features. If we remove a
        feature you are paying for, we will tell you in advance and you can cancel and receive a prorated refund for the
        unused part of your period.
      </P>
    ),
  },
  {
    id: 'liability',
    title: 'Disclaimers and liability',
    body: (
      <>
        <P>
          CommitFlex is provided &ldquo;as is&rdquo;. To the extent the law allows, we disclaim implied warranties of
          merchantability, fitness for a particular purpose and non-infringement.
        </P>
        <P>
          To the extent the law allows, we are not liable for indirect or consequential losses, such as lost profits,
          reputation or opportunities, and our total liability for any claim is limited to the amount you paid us in the
          12 months before the claim. Nothing in these terms limits liability that cannot be limited by law.
        </P>
      </>
    ),
  },
  {
    id: 'termination',
    title: 'Ending the agreement',
    body: (
      <P>
        You can stop using CommitFlex and delete your account at any time from settings. We may suspend or close an
        account that seriously or repeatedly breaks these terms. Where we can, we will warn you first and give you a
        chance to fix the problem. If we close a paid account without cause, we will refund the unused part of the
        period.
      </P>
    ),
  },
  {
    id: 'law',
    title: 'Governing law',
    body: (
      <P>
        These terms are governed by the laws of India. Courts in India have jurisdiction over disputes, without
        affecting any consumer protection rights you have where you live.
      </P>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: (
      <P>
        We will post changes on this page and update the date at the top. For changes that materially affect you, we
        will email you at least 14 days before they take effect. If you keep using CommitFlex after that, the new terms
        apply.
      </P>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <P>
        Questions about these terms, billing or a refund: <ContactLine />
      </P>
    ),
  },
]

export default async function TermsPage() {
  const session = await auth().catch(() => null)
  return (
    <MarketingShell signedIn={!!session?.user?.id}>
      <LegalPage
        title="Terms of service"
        updated={UPDATED}
        intro="These terms cover your use of CommitFlex, what we each agree to, and how billing, cancellation and refunds work."
        sections={SECTIONS}
      />
    </MarketingShell>
  )
}
