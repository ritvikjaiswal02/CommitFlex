'use client'

import * as React from 'react'
import { motion, useReducedMotion, type Transition } from 'motion/react'
import { Check, GitMerge, RotateCcw } from 'lucide-react'
import { PlatformIcon } from '@/components/brand/platform'
import { StatusNode, type NodeState } from '@/components/ui/status-node'
import { cn } from '@/lib/utils'
import { DEMO_LINKEDIN_DRAFT, DEMO_PR, DEMO_SCHEDULE } from '@/components/landing/demo-content'

/**
 * The landing page's one orchestrated sequence: a merged pull request becomes
 * a draft, the draft is approved, and it takes the next slot in the queue.
 * Plays once on load and again on Replay. Every element keeps its space from
 * the first frame, so nothing around the demo moves while it plays.
 */

type Stage = 0 | 1 | 2 | 3
// 0: PR merged   1: draft written (needs review)   2: approved   3: scheduled
const FINAL: Stage = 3
const STEPS: { stage: Stage; at: number }[] = [
  { stage: 1, at: 800 },
  { stage: 2, at: 3300 },
  { stage: 3, at: 4000 },
]

const EASE_OUT = [0.2, 0, 0, 1] as const

export function HeroDemo({ className }: { className?: string }) {
  const reduce = useReducedMotion() ?? false
  const [stage, setStage] = React.useState<Stage>(0)
  const [run, setRun] = React.useState(0)

  React.useEffect(() => {
    if (reduce) {
      setStage(FINAL)
      return
    }
    setStage(0)
    const timers = STEPS.map((step) => window.setTimeout(() => setStage(step.stage), step.at))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [run, reduce])

  const fade = (visible: boolean, delay = 0): Transition => {
    if (reduce) return { duration: 0.12 }
    // Hide instantly on replay; reveal with the standard enter curve.
    return visible ? { duration: 0.24, ease: EASE_OUT, delay } : { duration: 0.12 }
  }

  const draftNode: NodeState = stage >= 3 ? 'scheduled' : stage === 2 ? 'approved' : stage === 1 ? 'pending_review' : 'draft'
  const draftLabel = stage >= 3 ? 'Scheduled' : stage === 2 ? 'Approved' : 'Needs review'
  const playing = !reduce && stage < FINAL

  return (
    <figure className={cn('relative overflow-hidden rounded-xl border border-line bg-surface shadow-md', className)}>
      <figcaption className="sr-only">
        Example from CommitFlex&apos;s own repository: the merged pull request &ldquo;{DEMO_PR.title}&rdquo; becomes a
        LinkedIn draft, which is approved and scheduled for {DEMO_SCHEDULE.when}.
      </figcaption>

      {/* Window bar */}
      <div className="flex items-center gap-3 border-b border-line bg-sunken/60 px-4 py-2.5">
        <PlatformIcon platform="github" colored={false} className="size-4 text-fg-muted" />
        <span className="min-w-0 truncate font-mono text-xs text-fg-muted">{DEMO_PR.repo}</span>
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          disabled={playing}
          className="ml-auto inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-fg-muted transition-colors duration-120 ease-out hover:bg-surface hover:text-fg focus-ring disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          Replay
        </button>
      </div>

      <ol aria-hidden="true" className="flex flex-col p-4 sm:p-6">
        {/* 1. The ship moment */}
        <Row
          rail
          node={
            <span className="flex size-4 items-center justify-center rounded-full bg-accent text-accent-fg">
              <GitMerge className="size-2.5" strokeWidth={2.5} />
            </span>
          }
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-fg">Pull request merged</span>
            <span className="text-xs text-fg-subtle">{DEMO_PR.when}</span>
          </div>
          <p className="mt-1 text-sm text-fg-muted">{DEMO_PR.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
            <span className="font-mono text-fg-muted">{DEMO_PR.sha}</span>
            <span className="tabular-nums">
              <span className="text-success">+{DEMO_PR.additions.toLocaleString('en-US')}</span>{' '}
              <span className="text-danger">&minus;{DEMO_PR.deletions}</span>
            </span>
            <span className="tabular-nums">{DEMO_PR.files} files changed</span>
          </div>
        </Row>

        {/* 2. The draft */}
        <Row
          rail
          railVisible={stage >= 3}
          node={
            <motion.span
              key={draftNode}
              className="inline-flex"
              initial={{ opacity: 0.4, scale: reduce ? 1 : 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={reduce ? { duration: 0.12 } : { duration: 0.24, ease: EASE_OUT }}
            >
              <StatusNode state={draftNode} decorative />
            </motion.span>
          }
        >
          <div className="relative">
            <motion.div
              className="absolute inset-x-0 top-0 flex h-6 items-center gap-2 text-sm text-fg-subtle"
              initial={false}
              animate={{ opacity: stage === 0 ? 1 : 0 }}
              transition={{ duration: 0.12 }}
            >
              Reading the pull request
            </motion.div>

            <motion.div initial={false} animate={{ opacity: stage >= 1 ? 1 : 0 }} transition={fade(stage >= 1)}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-fg">Draft for LinkedIn</span>
                <span
                  className={cn(
                    'inline-flex h-5 items-center rounded-sm px-1.5 text-xs font-medium transition-colors duration-180 ease-out',
                    stage >= 2 ? 'bg-accent-soft text-accent-ink' : 'bg-warning-soft text-warning',
                  )}
                >
                  {draftLabel}
                </span>
              </div>

              <div className="mt-3 rounded-lg border border-line bg-canvas p-3 sm:p-4">
                <div className="mb-3 flex items-center gap-2">
                  <PlatformIcon platform="linkedin" className="size-4" />
                  <span className="text-xs text-fg-subtle">Plain and technical, in your voice</span>
                </div>
                <div className="flex flex-col gap-2.5 text-sm leading-[22px] text-fg">
                  {DEMO_LINKEDIN_DRAFT.map((paragraph, i) => (
                    <motion.p
                      key={i}
                      initial={false}
                      animate={{ opacity: stage >= 1 ? 1 : 0 }}
                      transition={fade(stage >= 1, reduce ? 0 : 0.2 + i * 0.55)}
                    >
                      {paragraph}
                    </motion.p>
                  ))}
                </div>
              </div>

              {/* Part of the picture, not controls: inert and visibly lighter than real buttons. */}
              <div className="pointer-events-none mt-3 flex select-none items-center gap-2" aria-hidden="true">
                <motion.span
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors duration-180 ease-out',
                    stage >= 2 ? 'border-transparent bg-accent-soft text-accent-ink' : 'border-line bg-accent-soft/60 text-accent-ink',
                  )}
                  initial={false}
                  animate={stage === 2 && !reduce ? { y: [0, 1, 0] } : { y: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  {stage >= 2 && <Check className="size-3.5" strokeWidth={2} />}
                  {stage >= 2 ? 'Approved' : 'Approve'}
                </motion.span>
                <span className="inline-flex h-8 items-center rounded-md border border-line px-3 text-sm text-fg-muted">
                  Edit
                </span>
              </div>
            </motion.div>
          </div>
        </Row>

        {/* 3. The slot */}
        <Row
          node={
            <motion.span
              className="inline-flex"
              initial={false}
              animate={{ opacity: stage >= 3 ? 1 : 0, scale: stage >= 3 || reduce ? 1 : 0.7 }}
              transition={fade(stage >= 3)}
            >
              <StatusNode state="scheduled" decorative />
            </motion.span>
          }
        >
          <motion.div
            initial={false}
            animate={{ opacity: stage >= 3 ? 1 : 0, y: stage >= 3 || reduce ? 0 : 4 }}
            transition={fade(stage >= 3, reduce ? 0 : 0.05)}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium text-fg">Scheduled for {DEMO_SCHEDULE.when}</span>
              <span className="text-xs text-fg-subtle">{DEMO_SCHEDULE.zone}</span>
            </div>
            <p className="mt-1 text-sm text-fg-muted">{DEMO_SCHEDULE.note}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-line bg-surface px-1.5 text-xs font-medium text-fg-muted">
                <PlatformIcon platform="linkedin" className="size-3.5" />
                Publishes on its own
              </span>
              <span className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-line bg-surface px-1.5 text-xs font-medium text-fg-muted">
                <PlatformIcon platform="twitter" className="size-3.5" />
                Ready to post in one tap
              </span>
            </div>
          </motion.div>
        </Row>
      </ol>
    </figure>
  )
}

function Row({
  node,
  children,
  rail = false,
  railVisible = true,
}: {
  node: React.ReactNode
  children: React.ReactNode
  rail?: boolean
  railVisible?: boolean
}) {
  return (
    <li className={cn('relative flex gap-3', rail && 'pb-6')}>
      {rail && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute bottom-0 left-2 top-6 w-px -translate-x-1/2 bg-line-strong transition-opacity duration-240 ease-out',
            railVisible ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
      <span className="relative z-[1] flex h-6 w-4 shrink-0 items-center justify-center">
        <span className="inline-flex rounded-full bg-surface ring-2 ring-surface">{node}</span>
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  )
}
