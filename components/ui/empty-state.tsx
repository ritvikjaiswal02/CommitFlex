import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  secondaryAction?: React.ReactNode
  size?: 'sm' | 'md'
  /** Left-aligned inside panels (default); centred for full-page states. */
  align?: 'start' | 'center'
  className?: string
}

/**
 * An empty state that invites the next action, e.g. "Nothing waiting for
 * review. Merge a pull request or run autopilot now." + "Draft something now".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
  align = 'start',
  className,
}: EmptyStateProps) {
  const centered = align === 'center'
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col gap-4',
        centered ? 'items-center text-center' : 'items-start text-left',
        size === 'sm' ? 'py-6' : 'py-10',
        className,
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-lg bg-sunken text-fg-muted',
          size === 'sm' ? 'size-10' : 'size-14',
        )}
      >
        <Icon
          className={size === 'sm' ? 'size-5' : 'size-6'}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>
      <div className={cn('flex max-w-md flex-col gap-1', centered && 'items-center')}>
        <h3 className={cn('font-semibold text-fg', size === 'sm' ? 'text-base' : 'text-lg')}>{title}</h3>
        {description && (
          <div className="line-clamp-2 text-sm text-fg-muted text-pretty">{description}</div>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className={cn('flex flex-wrap items-center gap-2', centered && 'justify-center')}>
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}
