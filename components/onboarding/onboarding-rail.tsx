'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Logo } from '@/components/brand/logo'

export interface RailStep {
  key: string
  label: string
  /** Short answer shown under a completed step, e.g. "2 repos". */
  summary?: string | null
}

export interface OnboardingRailProps {
  steps: RailStep[]
  currentIndex: number
  /** Steps the user may jump back to (already answered). */
  canVisit: (index: number) => boolean
  onVisit: (index: number) => void
  user: { name?: string | null; image?: string | null; login?: string | null; email?: string | null }
}

type NodeKind = 'done' | 'current' | 'upcoming'

/** The commit node for a step: done (filled, check), current (ring + dot), upcoming (hollow). */
function StepNode({ kind }: { kind: NodeKind }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative z-[1] flex size-4 shrink-0 items-center justify-center rounded-full ring-4 ring-surface transition-colors duration-180',
        kind === 'done' && 'bg-accent text-accent-fg',
        kind === 'current' && 'border-2 border-accent bg-surface',
        kind === 'upcoming' && 'border-[1.5px] border-line-strong bg-surface',
      )}
    >
      {kind === 'done' && <Check className="size-2.5" strokeWidth={3} />}
      {kind === 'current' && <span className="size-1.5 rounded-full bg-accent" />}
    </span>
  )
}

/** Desktop: a vertical commit rail of the steps. */
export function OnboardingRail({ steps, currentIndex, canVisit, onVisit, user }: OnboardingRailProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pt-8">
        <Logo href="/" />
      </div>

      <nav aria-label="Setup progress" className="mt-12 flex-1 px-8">
        <p className="mb-5 text-sm text-fg-muted">Set up autopilot</p>
        <ol className="relative">
          {/* the rail */}
          <span aria-hidden="true" className="absolute bottom-3 left-[7.5px] top-3 w-px bg-line-strong" />
          <li className="relative flex gap-3 pb-6">
            <StepNode kind="done" />
            <div className="-mt-0.5 min-w-0">
              <p className="text-sm font-medium text-fg">Signed in</p>
              {(user.login || user.email) && (
                <p className="truncate text-xs text-fg-muted">{user.login ? `@${user.login}` : user.email}</p>
              )}
            </div>
          </li>
          {steps.map((step, index) => {
            const kind: NodeKind = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming'
            const visitable = index !== currentIndex && canVisit(index)
            const last = index === steps.length - 1
            const content = (
              <>
                <StepNode kind={kind} />
                <span className="-mt-0.5 flex min-w-0 flex-col text-left">
                  <span
                    className={cn(
                      'text-sm',
                      kind === 'current' ? 'font-semibold text-fg' : kind === 'done' ? 'font-medium text-fg' : 'text-fg-subtle',
                    )}
                  >
                    {step.label}
                  </span>
                  {kind === 'done' && step.summary && (
                    <span className="truncate text-xs text-fg-muted">{step.summary}</span>
                  )}
                </span>
              </>
            )
            return (
              <li key={step.key} className={cn('relative', !last && 'pb-6')}>
                {visitable ? (
                  <button
                    type="button"
                    onClick={() => onVisit(index)}
                    className="group -mx-1.5 -my-1 flex w-[calc(100%+12px)] gap-3 rounded-md px-1.5 py-1 transition-colors duration-120 hover:bg-sunken focus-ring"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex gap-3" aria-current={kind === 'current' ? 'step' : undefined}>
                    {content}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="border-t border-line px-8 py-5">
        <div className="flex items-center gap-3">
          <Avatar src={user.image} name={user.name ?? user.login} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{user.name ?? user.login ?? 'Your account'}</p>
            <p className="text-xs text-fg-muted">Answers save as you go</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Mobile: logo, "Step 2 of 6" and a thin progress bar. */
export function OnboardingTopBar({ steps, currentIndex }: Pick<OnboardingRailProps, 'steps' | 'currentIndex'>) {
  const total = steps.length
  const step = Math.min(currentIndex + 1, total)
  return (
    <div className="border-b border-line bg-surface px-4 pb-3 pt-4 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <Logo href="/" />
        <p className="text-sm text-fg-muted tabular-nums">
          Step {step} of {total}
        </p>
      </div>
      <Progress value={step} max={total} className="mt-3" aria-label={`Step ${step} of ${total}`} />
    </div>
  )
}
