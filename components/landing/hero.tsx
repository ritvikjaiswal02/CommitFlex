import { ButtonLink } from '@/components/ui/button'
import { GitHubButton } from '@/components/landing/github-button'
import { HeroDemo } from '@/components/landing/hero-demo'
import { Container } from '@/components/landing/section'

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="pb-16 pt-12 md:pb-24 md:pt-20">
      <Container className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col lg:col-span-5">
          <h1 id="hero-title" className="text-balance text-display font-bold text-fg">
            <span className="block">You shipped it.</span> CommitFlex writes the post.
          </h1>
          <p className="mt-6 max-w-[34rem] text-pretty text-lg text-fg-muted">
            Connect GitHub and answer five questions. When a pull request merges or a release goes out, CommitFlex
            drafts a LinkedIn and X post in your voice, emails it to you for approval, publishes it to LinkedIn on schedule and hands X posts to you ready to post.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <GitHubButton size="lg" mobileFullWidth>
              Start with GitHub
            </GitHubButton>
            <ButtonLink href="/pricing" variant="secondary" size="lg">
              See pricing
            </ButtonLink>
          </div>

          <dl className="mt-8 grid max-w-[34rem] grid-cols-1 gap-3 border-t border-line pt-6 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-fg">14 days of Pro, free</dt>
              <dd className="text-fg-muted">No card needed to start.</dd>
            </div>
            <div>
              <dt className="font-medium text-fg">Reads commits, not code</dt>
              <dd className="text-fg-muted">Commit messages, PR descriptions and release notes.</dd>
            </div>
          </dl>
        </div>

        <div className="lg:col-span-7">
          <HeroDemo />
        </div>
      </Container>
    </section>
  )
}
