'use client'

import * as React from 'react'
import { PlatformIcon } from '@/components/brand/platform'
import { Section } from '@/components/landing/section'
import { DEMO_PR, TONE_EXAMPLES, type DemoTone } from '@/components/landing/demo-content'
import { cn } from '@/lib/utils'

const X_LIMIT = 280

export function VoicePreview() {
  const [tone, setTone] = React.useState<DemoTone>('plain_technical')
  const textRef = React.useRef<HTMLParagraphElement>(null)
  const [length, setLength] = React.useState<number | null>(null)
  const current = TONE_EXAMPLES.find((t) => t.value === tone) ?? TONE_EXAMPLES[0]

  React.useEffect(() => {
    setLength(textRef.current?.textContent?.length ?? null)
  }, [tone])

  return (
    <Section
      id="voice"
      title="Sounds like you, not like a press release."
      lead="Pick a tone, then paste two or three posts you've written before. CommitFlex matches your sentence length, structure and quirks, and keeps them in a voice profile."
    >
      <div className="grid overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <fieldset className="border-b border-line p-3 md:border-b-0 md:border-r">
          <legend className="sr-only">Tone</legend>
          <div className="grid grid-cols-2 gap-1 md:flex md:flex-col">
            {TONE_EXAMPLES.map((option) => {
              const selected = option.value === tone
              return (
                <label
                  key={option.value}
                  className={cn(
                    'relative flex cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2.5 transition-colors duration-120 ease-out',
                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-accent',
                    selected ? 'bg-accent-soft' : 'hover:bg-sunken',
                  )}
                >
                  <input
                    type="radio"
                    name="landing-tone"
                    value={option.value}
                    checked={selected}
                    onChange={() => setTone(option.value)}
                    className="sr-only"
                  />
                  <span className={cn('text-sm font-medium', selected ? 'text-accent-ink' : 'text-fg')}>
                    {option.label}
                  </span>
                  <span className={cn('hidden text-xs md:block', selected ? 'text-accent-ink/80' : 'text-fg-subtle')}>
                    {option.description}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="flex flex-col p-5 sm:p-6">
          <p className="text-sm text-fg-muted">
            The same commit, <code className="rounded-sm bg-sunken px-1 py-0.5 text-sm text-fg">{DEMO_PR.sha}</code>{' '}
            &ldquo;{DEMO_PR.title}&rdquo;, written five ways.
          </p>

          <article
            aria-live="polite"
            aria-label={`Example post in the ${current.label.toLowerCase()} tone`}
            className="mt-4 flex flex-1 flex-col rounded-lg border border-line bg-canvas p-4"
          >
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-sunken text-xs font-semibold text-fg-muted"
              >
                You
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">Your name</p>
                <p className="text-xs text-fg-subtle">Draft for X</p>
              </div>
              <PlatformIcon platform="twitter" className="ml-auto size-4" />
            </div>
            <p key={tone} ref={textRef} className="mt-3 text-base text-fg">
              {current.post}
            </p>
            <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs text-fg-subtle">
              <span>
                <span className="marker">Highlighted</span> text comes from the commit
              </span>
              {length !== null && (
                <span className={cn('tabular-nums', length > X_LIMIT && 'text-danger')}>
                  {length} / {X_LIMIT}
                </span>
              )}
            </div>
          </article>
        </div>
      </div>
    </Section>
  )
}
