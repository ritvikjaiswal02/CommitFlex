import { GitMerge, MailCheck, PenLine, Puzzle, type LucideIcon } from 'lucide-react'
import { LogoMark } from '@/components/brand/logo'
import { PlatformIcon, type BrandPlatform } from '@/components/brand/platform'
import { StatusNode } from '@/components/ui/status-node'
import { Section } from '@/components/landing/section'
import { DEMO_EXTENSION_QUEUE } from '@/components/landing/demo-content'

type Channel = { title: string; body: string } & (
  | { platform: BrandPlatform; icon?: never }
  | { icon: LucideIcon; platform?: never }
)

const CHANNELS: Channel[] = [
  {
    platform: 'linkedin',
    title: 'LinkedIn publishes on its own',
    body: 'Connect LinkedIn once. Approved posts go out through the official Share on LinkedIn API at their scheduled time, and you get a receipt with the link.',
  },
  {
    platform: 'twitter',
    title: 'X is one tap away',
    body: 'When an X post is due, the email and the app open X with the post already written. Check it, press Post, done.',
  },
  {
    icon: Puzzle,
    title: 'The Chrome extension fills the composer',
    body: 'Open the composer on LinkedIn or X and your queue is right there. Insert puts the text at the cursor, and CommitFlex marks it as posted.',
  },
  {
    icon: MailCheck,
    title: 'Approve from your inbox',
    body: 'Every draft arrives by email with an Approve link per platform. On Team, up to five reviewers get the same email.',
  },
]

export function Publishing() {
  return (
    <Section
      id="publishing"
      layout="stacked"
      title="No more copy and paste."
      lead="Drafts don't sit on a page waiting for you. Each one gets a time slot and goes out the way the platform allows: directly on LinkedIn, one tap on X, or straight into the composer with the extension."
    >
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
        <ul className="flex flex-col divide-y divide-line lg:col-span-5">
          {CHANNELS.map((channel) => {
            const Icon = channel.icon
            return (
              <li key={channel.title} className="flex gap-4 py-5 first:pt-0 last:pb-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-fg-muted">
                  {channel.platform ? (
                    <PlatformIcon platform={channel.platform} className="size-4" />
                  ) : Icon ? (
                    <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  ) : null}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-fg">{channel.title}</h3>
                  <p className="mt-1 text-sm text-fg-muted">{channel.body}</p>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="flex flex-col gap-4 lg:col-span-7" aria-hidden="true">
          <ComposerMock />
          <GitHubMock />
        </div>
      </div>
    </Section>
  )
}

/** Illustration: the extension's queue panel next to a social composer. */
function ComposerMock() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-md">
      <div className="flex items-center gap-2 border-b border-line bg-sunken/60 px-4 py-2.5">
        <PlatformIcon platform="linkedin" className="size-4" />
        <span className="text-xs text-fg-muted">Composer on linkedin.com</span>
      </div>

      <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="flex min-h-[180px] flex-col border-b border-line p-4 sm:border-b-0 sm:border-r">
          <div className="flex items-center gap-2.5">
            <span className="size-8 rounded-full bg-sunken" />
            <div className="flex flex-col gap-1.5">
              <span className="h-2 w-20 rounded-full bg-sunken" />
              <span className="h-2 w-12 rounded-full bg-sunken" />
            </div>
          </div>
          <p className="mt-4 text-sm text-fg">
            {DEMO_EXTENSION_QUEUE[0].text}
            <span className="ml-px inline-block h-4 w-px translate-y-0.5 bg-fg" />
          </p>
          <div className="mt-auto flex justify-end pt-4">
            <span
              aria-hidden="true"
              className="pointer-events-none inline-flex h-7 select-none items-center rounded-full bg-fg/70 px-3 text-xs font-semibold text-canvas"
            >
              Post
            </span>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <LogoMark size={16} className="text-fg" />
            <span className="text-sm font-medium text-fg">Your queue</span>
            <span className="ml-auto text-xs text-fg-subtle">LinkedIn</span>
          </div>
          <ul className="divide-y divide-line">
            {DEMO_EXTENSION_QUEUE.map((item, i) => (
              <li key={item.text} className="flex gap-3 px-4 py-3">
                <span className="flex h-5 items-center">
                  <StatusNode state={item.status} size="sm" decorative />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-fg-muted">{item.label}</span>
                    <span className="truncate font-mono text-fg-subtle">{item.repo}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-fg">{item.text}</p>
                </div>
                <span
                  aria-hidden="true"
                  className={
                    i === 0
                      ? 'pointer-events-none inline-flex h-7 shrink-0 select-none items-center rounded-md bg-accent-soft px-2 text-xs font-medium text-accent-ink'
                      : 'pointer-events-none inline-flex h-7 shrink-0 select-none items-center rounded-md border border-line px-2 text-xs text-fg-muted'
                  }
                >
                  {i === 0 ? 'Inserted' : 'Insert'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

/** Illustration: the "Draft a post" button the extension adds to GitHub pull request pages. */
function GitHubMock() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-xs sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
          <GitMerge className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">voice profiles</p>
          <p className="truncate text-xs text-fg-subtle">
            Merged into <span className="font-mono">main</span> on github.com
          </p>
        </div>
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none inline-flex h-8 shrink-0 select-none items-center gap-1.5 self-start rounded-md border border-line px-3 text-sm text-fg-muted sm:ml-auto sm:self-auto"
      >
        <PenLine className="size-3.5" strokeWidth={1.75} />
        Draft a post
      </span>
    </div>
  )
}
