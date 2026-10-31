import type { ReactNode } from 'react'
import { CalendarClock, CalendarRange, ChevronRight, GitMerge, Tag, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Section } from '@/components/landing/section'

const TRIGGERS: { icon: LucideIcon; title: string; body: string; plan: 'Every plan' | 'Pro' }[] = [
  {
    icon: GitMerge,
    title: 'A pull request merges',
    body: 'From a human author, with at least 20 changed lines. The post covers that PR and nothing else.',
    plan: 'Pro',
  },
  {
    icon: Tag,
    title: 'A release is published',
    body: 'Drafts and pre-releases are ignored. Release posts jump ahead of everything else in the queue.',
    plan: 'Pro',
  },
  {
    icon: CalendarRange,
    title: 'Monday comes around',
    body: 'A weekly digest from each repo with at least three meaningful commits in the last seven days.',
    plan: 'Every plan',
  },
  {
    icon: CalendarClock,
    title: 'A slot in your cadence is empty',
    body: 'Once a week up to every weekday. CommitFlex fills the slot from your most active repo.',
    plan: 'Pro',
  },
]

const code = (text: string) => (
  <code key={text} className="rounded-sm border border-line bg-surface px-1 py-px text-sm text-fg">
    {text}
  </code>
)

const join = (items: string[]): ReactNode[] =>
  items.flatMap((item, i) => [
    i > 0 ? (i === items.length - 1 ? ' or ' : ', ') : null,
    code(item),
  ])

const IGNORED: ReactNode[] = [
  <>Pull requests opened by bots: {join(['dependabot', 'renovate', 'github-actions'])} and any login ending in {code('[bot]')}.</>,
  <>Titles that start with {join(['chore:', 'ci:', 'build:', 'deps:', 'bump:', 'release:'])}.</>,
  <>Pull requests labelled {join(['dependencies', 'chore', 'skip-changelog', 'no-post'])}.</>,
  <>Changes under 20 lines.</>,
  <>Merge commits and {join(['wip:', 'fixup!', 'squash!'])} commits in a digest.</>,
]

export function ShipMoments() {
  return (
    <Section
      id="ship-moments"
      tone="sunken"
      title="It posts when you ship, and stays quiet when you don't."
      lead="CommitFlex never makes things up. If nothing worth talking about shipped this week, the slot stays empty and nobody gets an email."
    >
      <div className="flex flex-col gap-10">
        <div>
          <h3 className="text-lg font-semibold text-fg">What starts a draft</h3>
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {TRIGGERS.map(({ icon: Icon, title, body, plan }) => (
              <li key={title} className="flex gap-4 p-4 sm:p-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sunken text-fg-muted">
                  <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-medium text-fg">{title}</p>
                    <Badge variant={plan === 'Pro' ? 'accent' : 'neutral'}>{plan}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <details className="group max-w-prose">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm text-base font-medium text-fg focus-ring [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 text-fg-subtle transition-transform duration-180 group-open:rotate-90" strokeWidth={1.75} aria-hidden="true" />
            What it ignores (bots, chores, tiny changes)
          </summary>
          <ul className="mt-4 flex flex-col gap-3 pl-6">
            {IGNORED.map((item, i) => (
              <li key={i} className="text-sm text-fg-muted">
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 pl-6 text-sm text-fg-muted">
            Before anything reaches the AI, strings that look like secrets (GitHub tokens, API keys, AWS keys,{' '}
            {code('password=')} and {code('token=')} values) are replaced with placeholders.
          </p>
        </details>
      </div>
    </Section>
  )
}
