import { Section } from '@/components/landing/section'
import { QueuePreview } from '@/components/landing/queue-preview'

const SETUP: { title: string; body: string }[] = [
  {
    title: 'Sign in with GitHub',
    body: 'CommitFlex reads commit messages, pull request descriptions and release notes from the repos you choose.',
  },
  {
    title: 'Pick the repos to watch',
    body: 'We add a webhook so merged pull requests and releases reach us the moment they happen.',
  },
  {
    title: 'Answer five questions',
    body: 'Your role, who you want to reach, where you post, how you sound and how often to post.',
  },
]

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      title="Set it up once. After that you just ship."
      lead="No more copy, switch tabs, paste, fix the line breaks. Setup takes about two minutes; from then on every post starts from something you actually built, and lands in your queue ready to approve."
    >
      <div className="grid overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="border-b border-line p-5 md:border-b-0 md:border-r sm:p-6">
          <h3 className="text-sm font-semibold text-fg">Once</h3>
          <ol className="mt-5 flex flex-col gap-5">
            {SETUP.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs font-semibold tabular-nums text-fg-muted"
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-base font-medium text-fg">{step.title}</p>
                  <p className="mt-1 text-sm text-fg-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="bg-sunken/50 p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-fg">Every time you ship</h3>
          <p className="mt-1 text-sm text-fg-muted">
            A merged pull request, a release or the Monday digest becomes a LinkedIn post and an X post, scheduled into
            your next free slot. You get an email with an Approve button.
          </p>
          <QueuePreview className="mt-5" />
        </div>
      </div>
    </Section>
  )
}
