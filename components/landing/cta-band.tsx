import { ButtonLink } from '@/components/ui/button'
import { GitHubButton } from '@/components/landing/github-button'
import { Container } from '@/components/landing/section'
import { TRIAL_DAYS } from '@/lib/billing/catalog'

export function CtaBand({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section aria-labelledby="cta-title" className="border-t border-line py-16 md:py-20">
      <Container>
        <div className="flex flex-col gap-8 rounded-xl border border-line bg-surface p-6 sm:p-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[40rem]">
            <h2 id="cta-title" className="text-balance text-2xl font-semibold sm:text-3xl">
              Your next merged pull request can be your next post.
            </h2>
            <p className="mt-3 text-lg text-fg-muted">
              Setup takes about two minutes. Pro is free for {TRIAL_DAYS} days, and you don&apos;t need a card.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {signedIn ? (
              <ButtonLink href="/dashboard" size="lg">
                Open dashboard
              </ButtonLink>
            ) : (
              <GitHubButton size="lg" mobileFullWidth>
                Start with GitHub
              </GitHubButton>
            )}
            <ButtonLink href="/pricing" variant="secondary" size="lg">
              See pricing
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  )
}
