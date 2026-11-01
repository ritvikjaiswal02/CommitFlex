import type { ReactNode } from 'react'
import Link from 'next/link'
import { Section } from '@/components/landing/section'

const ITEMS: { term: string; detail: ReactNode }[] = [
  {
    term: 'What CommitFlex reads',
    detail:
      'Commit messages, pull request titles and descriptions, release notes and line counts, only from the repos you pick.',
  },
  {
    term: 'What it never reads',
    detail: 'Your source code. No file contents or diffs are fetched, stored or sent to an AI model.',
  },
  {
    term: 'Why it asks for repo access',
    detail: (
      <>
        GitHub only offers <code className="rounded-sm border border-line bg-surface px-1 py-px text-sm text-fg">repo</code> for
        reading private repositories, and{' '}
        <code className="rounded-sm border border-line bg-surface px-1 py-px text-sm text-fg">admin:repo_hook</code> lets us add the
        webhook that tells us when you ship. Every webhook has its own secret, and unsigned requests are rejected.
      </>
    ),
  },
  {
    term: 'Who writes the drafts',
    detail:
      'Google Gemini, with Anthropic Claude as a fallback. Anything that looks like a token, key or password is redacted before the text leaves our servers.',
  },
  {
    term: 'How LinkedIn access is kept',
    detail:
      'The access token is encrypted with AES-256-GCM before it is stored. CommitFlex can only post as you, and only posts you approved or set to auto-approve.',
  },
  {
    term: 'How to leave',
    detail:
      'Disconnect a repo or LinkedIn at any time. Deleting your account removes your repos, drafts, voice profiles and tokens and cancels any subscription.',
  },
]

export function Trust() {
  return (
    <Section
      id="trust"
      tone="sunken"
      title="Your code stays where it is."
      lead={
        <>
          CommitFlex works from the story your commits already tell. The{' '}
          <Link href="/privacy" className="rounded-sm text-accent underline-offset-4 hover:underline focus-ring">
            privacy policy
          </Link>{' '}
          has the full detail.
        </>
      }
    >
      <dl className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
        {ITEMS.map((item) => (
          <div key={item.term} className="flex flex-col gap-1.5 border-t border-line-strong pt-4">
            <dt className="text-base font-semibold text-fg">{item.term}</dt>
            <dd className="text-sm text-fg-muted">{item.detail}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}
