import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { Logo } from '@/components/brand/logo'
import { PlatformBadge } from '@/components/brand/platform'
import { Callout } from '@/components/ui/callout'
import { StatusNode } from '@/components/ui/status-node'
import { Timeline, TimelineItem } from '@/components/ui/timeline'
import { SignInButton } from './sign-in-button'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in with GitHub to turn what you ship into LinkedIn and X posts in your own voice.',
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams?: { next?: string; callbackUrl?: string; error?: string }
}

/** Only same-origin paths; never protocol-relative or absolute URLs. */
function safeNext(value: string | undefined): string | null {
  if (!value) return null
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  if (value.startsWith('/login') || value.startsWith('/api/')) return null
  return value
}

function errorCopy(code: string | undefined): { title: string; body: string } | null {
  if (!code) return null
  switch (code) {
    case 'AccessDenied':
      return {
        title: 'GitHub sign-in was cancelled',
        body: 'Nothing was connected. Continue with GitHub when you’re ready.',
      }
    case 'Configuration':
      // The operator hint goes to the server log, never to the person signing in.
      console.error('[login] Auth.js Configuration error: check GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and AUTH_SECRET.')
      return {
        title: 'Sign-in is temporarily unavailable',
        body: 'GitHub sign-in isn’t working on our side right now. Try again in a few minutes.',
      }
    case 'OAuthAccountNotLinked':
      return {
        title: 'That email is already linked to another sign-in',
        body: 'Sign in with the GitHub account you used the first time.',
      }
    default:
      return {
        title: 'GitHub sign-in didn’t finish',
        body: 'GitHub didn’t confirm the sign-in. Try again; if it keeps failing, sign out of GitHub and back in.',
      }
  }
}

const NEXT_STEPS = [
  { title: 'Pick the repos to watch', body: 'We add a webhook so merged pull requests and releases reach us.' },
  { title: 'Answer five questions', body: 'Who you are, who you write for, where and how often to post.' },
  { title: 'Approve drafts from your inbox', body: 'Each draft arrives with an Approve button. LinkedIn posts go out on schedule.' },
]

export default async function LoginPage({ searchParams }: PageProps) {
  const next = safeNext(searchParams?.next) ?? safeNext(searchParams?.callbackUrl)
  const session = await auth()
  if (session?.user?.id) redirect(next ?? '/dashboard')

  const error = errorCopy(searchParams?.error)

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-10 lg:px-16 lg:py-10">
        <Logo href="/" />

        <main className="flex flex-1 flex-col justify-center py-12">
          <div className="flex w-full max-w-[400px] flex-col gap-8">
            <div className="flex flex-col gap-3">
              <h1 className="text-2xl font-semibold text-fg text-balance sm:text-3xl">
                Sign in with GitHub to get started
              </h1>
              <p className="text-base text-fg-muted text-pretty">
                CommitFlex reads commit messages, pull request titles and release notes from the repos you choose. It
                never reads or stores your source code.
              </p>
            </div>

            {error && (
              <Callout tone={searchParams?.error === 'AccessDenied' ? 'info' : 'danger'} title={error.title}>
                {error.body}
              </Callout>
            )}

            <div className="flex flex-col gap-4">
              <SignInButton callbackUrl={next ?? '/dashboard'} />
              <p className="text-sm text-fg-muted text-pretty">
                We ask for repository access so we can read private repos you select and add a webhook that tells us
                when you ship. You can disconnect any repo at any time.
              </p>
            </div>
          </div>
        </main>

        <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-fg-subtle">
          <Link href="/pricing" className="rounded-sm hover:text-fg focus-ring">
            Pricing
          </Link>
          <Link href="/terms" className="rounded-sm hover:text-fg focus-ring">
            Terms
          </Link>
          <Link href="/privacy" className="rounded-sm hover:text-fg focus-ring">
            Privacy
          </Link>
        </footer>
      </div>

      <aside
        aria-label="What happens after you sign in"
        className="hidden border-l border-line bg-surface lg:flex lg:flex-col lg:justify-center lg:px-16 lg:py-10"
      >
        <div className="flex max-w-[480px] flex-col gap-10">
          <section className="flex flex-col gap-5">
            <h2 className="text-lg font-semibold text-fg">What happens next</h2>
            <ol className="flex flex-col gap-4">
              {NEXT_STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs font-medium text-fg-muted tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium text-fg">{step.title}</p>
                    <p className="text-sm text-fg-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 shadow-xs">
            <p className="text-xs text-fg-muted">An example from the CommitFlex repository</p>
            <Timeline>
              <TimelineItem node={<StatusNode state="draft" label="Commit" />}>
                <p className="text-sm text-fg-muted">Merged to main</p>
                <p className="mt-1 font-mono text-sm text-fg">
                  <span className="text-fg-subtle">ec2a23c</span>{' '}
                  <span className="marker">generate from PR or release tag</span>
                </p>
              </TimelineItem>
              <TimelineItem node={<StatusNode state="pending_review" />}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-fg">Draft written</p>
                  <PlatformBadge platform="linkedin" />
                </div>
                <p className="mt-2 text-sm leading-6 text-fg-muted">
                  You can now point CommitFlex at a single pull request or a release tag instead of a date range. One
                  release, one post, written from what actually changed.
                </p>
              </TimelineItem>
              <TimelineItem node={<StatusNode state="scheduled" />}>
                <p className="text-sm font-medium text-fg">Approved from email</p>
                <p className="text-sm text-fg-muted">Scheduled for Tue, 9:00</p>
              </TimelineItem>
            </Timeline>
          </section>
        </div>
      </aside>
    </div>
  )
}
