import { StatusNode, type NodeState } from '@/components/ui/status-node'
import { PlatformIcon, platformLabel } from '@/components/brand/platform'
import { DEMO_PR, DEMO_SCHEDULE } from '@/components/landing/demo-content'
import { cn } from '@/lib/utils'

/**
 * A static picture of the Today queue, drawn with the app's own row anatomy
 * (status rail, platform, repo, slot, text) and theme tokens. Every row is a
 * real commit from CommitFlex's repository. It is an illustration: hidden
 * from assistive tech and inert to the pointer.
 */
const ROWS: {
  state: NodeState
  stateLabel: string
  platform: 'linkedin' | 'twitter'
  source: string
  when: string
  text: string
}[] = [
  {
    state: 'pending_review',
    stateLabel: 'Needs review',
    platform: 'linkedin',
    source: `Merged PR · ${DEMO_PR.title}`,
    when: `${DEMO_SCHEDULE.when} ${DEMO_SCHEDULE.zone}`,
    text: 'CommitFlex can now draft a post from a single pull request or a release tag, not only a date range. Release mode compares against the previous tag, so the post covers exactly what shipped.',
  },
  {
    state: 'scheduled',
    stateLabel: 'Scheduled',
    platform: 'twitter',
    source: 'Merged PR · voice profiles',
    when: `Thu, 9:00 ${DEMO_SCHEDULE.zone}`,
    text: 'Shipped voice profiles: keep a few saved voices (launch posts, deep dives) and pick one per draft. Autopilot uses your default.',
  },
  {
    state: 'published',
    stateLabel: 'Published',
    platform: 'linkedin',
    source: 'Weekly digest',
    when: 'Mon, 9:00',
    text: 'This week the landing page was rebuilt around real content: every demo on it is drawn from actual commits in the repo, not placeholder copy.',
  },
]

export function QueuePreview({ className }: { className?: string }) {
  return (
    <figure aria-hidden="true" className={cn('pointer-events-none select-none', className)}>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <span className="text-sm font-semibold text-fg">Today</span>
          <span className="text-xs text-fg-muted">1 draft needs your review</span>
        </div>
        <ul>
          {ROWS.map((row, index) => {
            const first = index === 0
            const last = index === ROWS.length - 1
            return (
              <li
                key={row.text}
                className={cn('relative grid grid-cols-[16px_minmax(0,1fr)] gap-x-3 px-4 py-4', !first && 'border-t border-line')}
              >
                <span
                  className={cn(
                    'absolute left-6 w-px -translate-x-1/2 bg-line-strong',
                    first ? 'top-[26px]' : 'top-0',
                    last ? 'h-[26px]' : 'bottom-0',
                  )}
                />
                <div className="relative z-[1] flex h-5 items-start justify-center pt-0.5">
                  <span className="inline-flex rounded-full bg-surface ring-4 ring-surface">
                    <StatusNode state={row.state} decorative />
                  </span>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <PlatformIcon platform={row.platform} className="size-3.5" />
                      <span className="text-sm font-medium text-fg">{platformLabel(row.platform)}</span>
                      <span className="truncate text-xs text-fg-subtle">{row.stateLabel}</span>
                    </span>
                    <span className="text-xs tabular-nums text-fg-muted">{row.when}</span>
                  </div>
                  <p className="line-clamp-3 text-sm leading-6 text-fg">{row.text}</p>
                  <p className="truncate text-xs text-fg-muted">
                    From <span className="marker">{row.source}</span>
                  </p>
                  {row.state === 'pending_review' && (
                    <div className="flex gap-2 pt-1">
                      <span className="inline-flex h-7 items-center rounded-md border border-line px-2.5 text-xs font-medium text-fg-muted">
                        Approve
                      </span>
                      <span className="inline-flex h-7 items-center rounded-md px-2.5 text-xs text-fg-subtle">Edit</span>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
      <figcaption className="mt-3 text-sm text-fg-muted">
        Your queue in CommitFlex. Each post names what it came from.
      </figcaption>
    </figure>
  )
}
