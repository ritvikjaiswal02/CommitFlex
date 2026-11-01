import type { ReactNode } from 'react'
import Link from 'next/link'
import { Container } from '@/components/landing/section'
import { cn } from '@/lib/utils'

export interface LegalSection {
  id: string
  title: string
  body: ReactNode
}

/**
 * Where people reach a human. SUPPORT_EMAIL wins; otherwise the sending
 * address from EMAIL_FROM, unless it is Resend's shared test sender.
 */
export function supportEmail(): string | null {
  const explicit = process.env.SUPPORT_EMAIL?.trim()
  if (explicit) return explicit
  const from = process.env.EMAIL_FROM?.trim()
  if (!from) return null
  const match = from.match(/<([^>]+)>/)
  const address = (match ? match[1] : from).trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.endsWith('@resend.dev')) return null
  return address
}

export function ContactLine() {
  const email = supportEmail()
  if (email) {
    return (
      <>
        Email{' '}
        <a href={`mailto:${email}`} className={linkClass}>
          {email}
        </a>{' '}
        and a person will reply, usually within two working days.
      </>
    )
  }
  return (
    <>
      Reply to any email CommitFlex has sent you. A person reads every message and usually replies within two working
      days.
    </>
  )
}

export const linkClass = 'rounded-sm text-accent underline-offset-4 hover:underline focus-ring'

/* Prose building blocks so legal text keeps one rhythm without a typography plugin. */
export function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-base text-fg-muted', className)}>{children}</p>
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5 text-base text-fg-muted marker:text-fg-subtle">{children}</ul>
}

export function Term({ children }: { children: ReactNode }) {
  return <strong className="font-medium text-fg">{children}</strong>
}

export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string
  /** ISO date, e.g. '2026-11-01'. */
  updated: string
  intro: ReactNode
  sections: LegalSection[]
}) {
  const updatedLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${updated}T00:00:00Z`),
  )

  return (
    <article aria-labelledby="legal-title" className="pb-20 pt-12 md:pb-28 md:pt-20">
      <Container className="grid gap-10 lg:grid-cols-12 lg:gap-8">
        <header className="flex flex-col gap-4 lg:col-span-8 lg:col-start-4">
          <h1 id="legal-title" className="text-3xl font-semibold sm:text-4xl">
            {title}
          </h1>
          <p className="text-sm text-fg-subtle">
            Last updated <time dateTime={updated}>{updatedLabel}</time>
          </p>
          <div className="max-w-prose text-lg text-fg-muted">{intro}</div>
        </header>

        <nav
          aria-label="On this page"
          className="lg:col-span-3 lg:col-start-1 lg:row-start-2"
        >
          <div className="rounded-lg border border-line bg-surface p-4 lg:sticky lg:top-20 lg:border-0 lg:bg-transparent lg:p-0">
            <p className="text-sm font-semibold text-fg">On this page</p>
            <ol className="mt-3 flex flex-col gap-1.5">
              {sections.map((section) => (
                <li key={section.id}>
                  <Link
                    href={`#${section.id}`}
                    className="rounded-sm text-sm text-fg-muted transition-colors duration-120 ease-out hover:text-fg focus-ring"
                  >
                    {section.title}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="flex flex-col lg:col-span-8 lg:col-start-4 lg:row-start-2">
          {sections.map((section, i) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-title`}
              className={cn('max-w-prose scroll-mt-20 py-8', i > 0 && 'border-t border-line')}
            >
              <h2 id={`${section.id}-title`} className="text-xl font-semibold">
                {i + 1}. {section.title}
              </h2>
              <div className="mt-4 flex flex-col gap-4">{section.body}</div>
            </section>
          ))}
        </div>
      </Container>
    </article>
  )
}
