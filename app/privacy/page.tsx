import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/auth'
import { MarketingShell } from '@/components/landing/marketing-shell'
import { ContactLine, LegalPage, P, Term, UL, linkClass, type LegalSection } from '@/components/landing/legal'

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What CommitFlex collects, why, who processes it and how to delete it.',
}

const UPDATED = '2026-11-01'

const SECTIONS: LegalSection[] = [
  {
    id: 'summary',
    title: 'The short version',
    body: (
      <UL>
        <li>CommitFlex reads commit messages, pull request text and release notes from repos you choose. It never reads your source code.</li>
        <li>That text is sent to an AI provider to write drafts, after anything that looks like a secret is removed.</li>
        <li>We don&apos;t sell your data, show ads or use third-party analytics or tracking cookies.</li>
        <li>You can disconnect anything at any time, and deleting your account deletes your data.</li>
      </UL>
    ),
  },
  {
    id: 'collect',
    title: 'What we collect',
    body: (
      <>
        <P>
          <Term>Your GitHub account.</Term> When you sign in we receive your GitHub user ID, username, name, email
          address and avatar, plus an access token that lets CommitFlex call GitHub on your behalf.
        </P>
        <P>
          <Term>Repositories you connect.</Term> For each repo you pick we store its name, default branch and the ID and
          secret of the webhook we install. When CommitFlex writes about your work it reads commit messages, commit
          authors and dates, pull request titles, descriptions and line counts, and release names and notes.
        </P>
        <P>
          <Term>Your answers and writing.</Term> Your onboarding answers (role, one-line description of what you build,
          audiences, platforms, tone, timezone and posting cadence), any past posts you paste as writing samples, and
          the voice profile we derive from them.
        </P>
        <P>
          <Term>Drafts and publishing history.</Term> The drafts CommitFlex writes, your edits, the queue, approvals, and
          the ID and link of each published post.
        </P>
        <P>
          <Term>LinkedIn, if you connect it.</Term> Your LinkedIn member ID, name, email address, profile photo and an
          access token that allows posting as you.
        </P>
        <P>
          <Term>Billing.</Term> Your plan, billing period and currency, and the subscription, customer and payment IDs
          from Razorpay. Card and UPI details go directly to Razorpay. We never see or store them.
        </P>
        <P>
          <Term>Browser extension.</Term> The name of each extension connection and when it was last used. The token
          itself is stored only as a one-way hash.
        </P>
        <P>
          <Term>Technical data.</Term> The country our hosting provider reports for your request, used to show prices in
          the right currency, and short-lived server logs used to debug errors.
        </P>
      </>
    ),
  },
  {
    id: 'not-collected',
    title: 'What we don’t collect',
    body: (
      <UL>
        <li>Source code. CommitFlex doesn&apos;t fetch file contents or diffs from your repositories.</li>
        <li>Repositories you haven&apos;t connected, apart from the list of names shown when you pick one.</li>
        <li>
          Advertising or analytics data. There are no third-party trackers. The only cookies are the sign-in session and
          a short-lived cookie that protects the LinkedIn connection step. Your light or dark theme choice is kept in
          your browser&apos;s local storage.
        </li>
      </UL>
    ),
  },
  {
    id: 'use',
    title: 'How we use it',
    body: (
      <UL>
        <li>To write drafts about your work in your voice, schedule them and publish the ones you approve.</li>
        <li>To email you drafts for approval, publishing receipts, reminders and billing notices. You can turn most of these off in settings.</li>
        <li>To enforce plan limits and process payments.</li>
        <li>To keep the service secure, investigate abuse and fix problems.</li>
      </UL>
    ),
  },
  {
    id: 'ai',
    title: 'AI processing',
    body: (
      <>
        <P>
          Drafts are written by Google&apos;s Gemini models, with Anthropic&apos;s Claude models used when Gemini is
          unavailable. We send only what a draft needs: commit messages, pull request and release text, your onboarding
          answers and your voice profile.
        </P>
        <P>
          Before that text leaves our servers, strings that look like credentials (GitHub tokens, API keys, AWS access
          keys, and values after <code className="rounded-sm bg-sunken px-1 text-sm">password=</code>,{' '}
          <code className="rounded-sm bg-sunken px-1 text-sm">secret=</code> or{' '}
          <code className="rounded-sm bg-sunken px-1 text-sm">token=</code>) are replaced with placeholders. Pattern
          matching can miss unusual formats, so please don&apos;t put secrets in commit messages.
        </P>
        <P>How each provider handles API requests is governed by its own API terms and privacy policy.</P>
      </>
    ),
  },
  {
    id: 'processors',
    title: 'Who else processes your data',
    body: (
      <>
        <P>We use these providers to run CommitFlex. Each receives only what its job needs.</P>
        <UL>
          <li><Term>Vercel</Term> hosts the application.</li>
          <li><Term>Neon</Term> hosts the Postgres database.</li>
          <li><Term>Google</Term> and <Term>Anthropic</Term> write drafts, as described above.</li>
          <li><Term>Resend</Term> delivers email.</li>
          <li><Term>Razorpay</Term> processes payments and subscriptions.</li>
          <li><Term>GitHub</Term> and, if you connect it, <Term>LinkedIn</Term>, which we call on your behalf.</li>
        </UL>
        <P>
          We don&apos;t sell or rent personal data. We disclose it to anyone else only if the law requires it, and we
          will tell you unless we are legally prevented from doing so.
        </P>
      </>
    ),
  },
  {
    id: 'security',
    title: 'How we protect it',
    body: (
      <UL>
        <li>All traffic uses HTTPS.</li>
        <li>LinkedIn access tokens are encrypted with AES-256-GCM before they are stored.</li>
        <li>Extension tokens and email approval links are stored only as SHA-256 hashes, and approval links expire.</li>
        <li>Every repository webhook has its own random secret, and requests without a valid signature are rejected.</li>
      </UL>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    body: (
      <>
        <P>
          We keep your data while your account is open. Disconnecting a repository stops all reading from it and removes
          the webhook we installed. Disconnecting LinkedIn stops all posting to it.
        </P>
        <P>
          Deleting your account from settings permanently removes your profile, repositories, drafts, queue, voice
          profiles, connections and tokens, and cancels any active subscription. We keep billing records for as long as
          tax and accounting law requires, and server logs roll over within 30 days.
        </P>
      </>
    ),
  },
  {
    id: 'rights',
    title: 'Your choices and rights',
    body: (
      <>
        <P>
          You can see and edit most of your data in the app, change email preferences in{' '}
          <Link href="/settings" className={linkClass}>
            settings
          </Link>
          , and delete your account at any time. You can also revoke CommitFlex&apos;s access from GitHub&apos;s and
          LinkedIn&apos;s own settings.
        </P>
        <P>
          Depending on where you live, you may have the right to request a copy of your data, correct it, restrict or
          object to how it is used, or ask us to delete it. Contact us and we will respond within 30 days.
        </P>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: <P>CommitFlex is not meant for anyone under 16, and we don&apos;t knowingly collect their data.</P>,
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <P>
        If we change what we collect or who processes it, we will update this page and change the date at the top. For
        significant changes we will also email you before they take effect.
      </P>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <P>
        Questions or requests about your data: <ContactLine />
      </P>
    ),
  },
]

export default async function PrivacyPage() {
  const session = await auth().catch(() => null)
  return (
    <MarketingShell signedIn={!!session?.user?.id}>
      <LegalPage
        title="Privacy policy"
        updated={UPDATED}
        intro="This policy explains what CommitFlex collects when you use it, why, who processes it on our behalf and how you can delete it."
        sections={SECTIONS}
      />
    </MarketingShell>
  )
}
