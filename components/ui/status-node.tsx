import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The commit-node glyph. Every queue/draft state has one shape so users learn
 * the states once. `QueueStatus` values map one to one; a draft with no queue
 * item is 'draft'.
 */
export type NodeState =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'scheduled'
  | 'ready'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped'

export const NODE_LABELS: Record<NodeState, string> = {
  draft: 'Draft',
  pending_review: 'Needs review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  ready: 'Ready to post',
  publishing: 'Publishing',
  published: 'Published',
  failed: 'Failed',
  skipped: 'Skipped',
}

export const NODE_STATES = Object.keys(NODE_LABELS) as NodeState[]

export function isNodeState(value: unknown): value is NodeState {
  return typeof value === 'string' && value in NODE_LABELS
}

export interface StatusNodeProps {
  state: NodeState
  size?: 'sm' | 'md'
  /** Overrides the accessible name (defaults to NODE_LABELS[state]). */
  label?: string
  /** Hide from assistive tech when the state is already written next to it. */
  decorative?: boolean
  className?: string
}

// Geometry in a 16×16 box: ring r=6.25 with a 1.5 stroke, solid fill r=7.
const RING = 6.25

function Glyph({ state }: { state: NodeState }) {
  switch (state) {
    case 'draft':
      return <circle cx="8" cy="8" r={RING} className="fill-surface stroke-line-strong" strokeWidth="1.5" />
    case 'pending_review':
      return (
        <>
          <circle cx="8" cy="8" r={RING} className="fill-surface stroke-warning" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2" className="fill-warning" />
        </>
      )
    case 'approved':
      return (
        <>
          <circle cx="8" cy="8" r={RING} className="fill-surface stroke-accent" strokeWidth="1.5" />
          <path d={`M8 ${8 - RING} A${RING} ${RING} 0 0 0 8 ${8 + RING} Z`} className="fill-accent" />
        </>
      )
    case 'scheduled':
      return (
        <>
          <circle cx="8" cy="8" r={RING} className="fill-surface stroke-accent" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2" className="fill-accent" />
        </>
      )
    case 'ready':
      return (
        <>
          <circle cx="8" cy="8" r="7" className="fill-accent" />
          <circle cx="8" cy="8" r="2" className="fill-accent-fg" />
        </>
      )
    case 'publishing':
      return (
        <>
          <circle cx="8" cy="8" r={RING} className="fill-surface stroke-accent/30" strokeWidth="1.5" />
          <path
            d={`M8 ${8 - RING} A${RING} ${RING} 0 0 1 ${8 + RING} 8`}
            className="fill-none stroke-accent motion-safe:animate-node-spin"
            style={{ transformOrigin: '8px 8px' }}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      )
    case 'published':
      return (
        <>
          <circle cx="8" cy="8" r="7" className="fill-success" />
          <path
            d="M4.9 8.2 7.05 10.3 11.1 6"
            className="fill-none stroke-success-fg"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )
    case 'failed':
      return (
        <>
          <circle cx="8" cy="8" r="7" className="fill-danger" />
          <path
            d="M5.75 5.75 10.25 10.25M10.25 5.75 5.75 10.25"
            className="fill-none stroke-danger-fg"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )
    case 'skipped':
      return (
        <circle
          cx="8"
          cy="8"
          r={RING}
          className="fill-surface stroke-line-strong"
          strokeWidth="1.5"
          strokeDasharray="2.3 2.6"
        />
      )
    default:
      return null
  }
}

export function StatusNode({ state, size = 'md', label, decorative = false, className }: StatusNodeProps) {
  const px = size === 'sm' ? 12 : 16
  return (
    <svg
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : (label ?? NODE_LABELS[state])}
      data-slot="status-node"
      data-state={state}
      width={px}
      height={px}
      viewBox="0 0 16 16"
      className={cn('shrink-0 overflow-visible', className)}
    >
      <Glyph state={state} />
    </svg>
  )
}

/** A node followed by its label, for status cells and badges. */
export function StatusLabel({
  state,
  size = 'sm',
  className,
  children,
}: {
  state: NodeState
  size?: 'sm' | 'md'
  className?: string
  children?: React.ReactNode
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm text-fg-muted', className)}>
      <StatusNode state={state} size={size} decorative />
      <span>{children ?? NODE_LABELS[state]}</span>
    </span>
  )
}
