import * as React from 'react'
import { Download, GitMerge, PanelTop } from 'lucide-react'
import { PlatformIcon } from '@/components/brand/platform'
import { CopyButton } from '@/components/ui/copy-button'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Step {
  title: string
  body: React.ReactNode
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => {
        const last = index === steps.length - 1
        return (
          <li key={step.title} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && (
              <span aria-hidden="true" className="absolute left-[11px] top-7 h-[calc(100%-1.75rem)] w-px bg-line-strong" />
            )}
            <span
              aria-hidden="true"
              className="relative flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-xs font-semibold tabular-nums text-fg-muted ring-2 ring-surface"
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-1 pt-0.5">
              <p className="text-sm font-medium text-fg">{step.title}</p>
              <div className="text-sm text-fg-muted">{step.body}</div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function CodeLine({ value }: { value: string }) {
  return (
    <span className="mt-1.5 flex items-center gap-1 rounded-md border border-line bg-sunken py-1 pl-2.5 pr-1">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{value}</code>
      <CopyButton value={value} size="icon-sm" variant="ghost" label={`Copy ${value}`} />
    </span>
  )
}

/** Install steps: the Chrome Web Store when a listing exists, load-unpacked otherwise. */
export function InstallGuide({ storeUrl }: { storeUrl: string | null }) {
  const steps: Step[] = storeUrl
    ? [
        {
          title: 'Add CommitFlex to Chrome',
          body: (
            <>
              Install it from the Chrome Web Store.
              <a
                href={storeUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'mt-2 w-fit')}
              >
                Open the Chrome Web Store
              </a>
            </>
          ),
        },
        { title: 'Pin it to the toolbar', body: 'Open the puzzle-piece menu and pin CommitFlex so the queue is one click away.' },
        { title: 'Reload this page and connect', body: 'Choose Connect extension above. No token to copy.' },
      ]
    : [
        {
          title: 'Download the extension',
          body: (
            <>
              A zip of the extension, already pointed at this CommitFlex account&rsquo;s address.
              <a
                href="/extension/download"
                download="commitflex-extension.zip"
                className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'mt-2 w-fit')}
              >
                <Download strokeWidth={1.75} aria-hidden="true" />
                Download the extension (.zip)
              </a>
            </>
          ),
        },
        { title: 'Unzip it', body: 'Double-click the file. Keep the folder somewhere it will stay, such as Documents: Chrome loads it from there.' },
        {
          title: 'Load it in Chrome',
          body: (
            <>
              Open the extensions page, turn on Developer mode (top right), choose Load unpacked and pick the unzipped
              folder.
              <CodeLine value="chrome://extensions" />
              <ExtensionsPageSketch />
            </>
          ),
        },
        { title: 'Reload this page and connect', body: 'Choose Connect extension above. No token to copy.' },
      ]

  return (
    <section id="install" aria-labelledby="install-title" className="flex scroll-mt-24 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="install-title" className="text-xl font-semibold text-fg">
          Install
        </h2>
        <p className="text-sm text-fg-muted">
          {storeUrl ? 'Chrome, Edge, Brave and Arc all run Chrome extensions.' : 'Works in Chrome, Edge, Brave and Arc.'}
        </p>
      </div>
      {!storeUrl && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          <span className="inline-flex items-center rounded-full border border-line bg-sunken px-2 py-0.5 text-xs font-medium text-fg">
            Early access
          </span>
          The Chrome Web Store listing is in review. Until it&rsquo;s live, install it from the download below; it
          takes about a minute.
        </p>
      )}
      <div className="rounded-lg border border-line bg-surface p-4 sm:p-5">
        <StepList steps={steps} />
      </div>
    </section>
  )
}

const CAPABILITIES: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: 'A queue button in the LinkedIn and X composers',
    body: 'Your ready, scheduled and waiting drafts for that platform. Insert puts the text at your cursor, then mark it as posted.',
    icon: (
      <span className="flex items-center -space-x-1">
        <PlatformIcon platform="linkedin" className="size-4 rounded-sm ring-2 ring-surface" />
        <PlatformIcon platform="twitter" className="size-4 rounded-sm bg-surface ring-2 ring-surface" />
      </span>
    ),
  },
  {
    title: 'Draft a post from GitHub',
    body: 'On merged pull requests and release pages. CommitFlex writes both posts and tells you when they are ready.',
    icon: <GitMerge className="size-4 text-fg-muted" strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    title: 'Your queue in the toolbar',
    body: 'Copy a draft, insert it into the open tab, or open it in CommitFlex. The badge counts posts ready to go out.',
    icon: <PanelTop className="size-4 text-fg-muted" strokeWidth={1.75} aria-hidden="true" />,
  },
]

export function Capabilities() {
  return (
    <section aria-labelledby="capabilities-title" className="flex flex-col gap-4">
      <h2 id="capabilities-title" className="text-xl font-semibold text-fg">
        What it adds
      </h2>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {CAPABILITIES.map((item) => (
          <li key={item.title} className="flex gap-3 p-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken">{item.icon}</span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-medium text-fg">{item.title}</p>
              <p className="text-sm text-fg-muted">{item.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * An annotated sketch of chrome://extensions: where Developer mode and Load
 * unpacked are. A picture, not controls, so it is hidden from assistive tech
 * and ignores the pointer.
 */
function ExtensionsPageSketch() {
  return (
    <figure className="mt-3 select-none" aria-hidden="true">
      <div className="pointer-events-none overflow-hidden rounded-md border border-line bg-canvas">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-3 py-2">
          <span className="text-xs font-medium text-fg">Extensions</span>
          <span className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-fg ring-2 ring-accent ring-offset-1 ring-offset-surface">
            Developer mode
            <span className="relative inline-flex h-3.5 w-6 items-center rounded-full bg-accent">
              <span className="absolute right-0.5 size-2.5 rounded-full bg-accent-fg" />
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <span className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg ring-2 ring-accent ring-offset-1 ring-offset-canvas">
            Load unpacked
          </span>
          <span className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg-subtle">Pack extension</span>
          <span className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg-subtle">Update</span>
        </div>
      </div>
      <figcaption className="mt-1.5 text-xs text-fg-subtle">
        1. Turn on Developer mode. 2. Choose Load unpacked and pick the folder you unzipped.
      </figcaption>
    </figure>
  )
}
