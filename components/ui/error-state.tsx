'use client'

import * as React from 'react'
import { CircleAlert, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface ErrorStateProps {
  title?: string
  /** Say what failed and how to fix it. */
  description?: React.ReactNode
  onRetry?: () => void
  retryLabel?: string
  /** Extra actions next to the retry button. */
  action?: React.ReactNode
  align?: 'start' | 'center'
  className?: string
}

export function ErrorState({
  title = "This didn't load",
  description = 'Check your connection and try again. If it keeps failing, reload the page.',
  onRetry,
  retryLabel = 'Try again',
  action,
  align = 'start',
  className,
}: ErrorStateProps) {
  const centered = align === 'center'
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn(
        'flex flex-col gap-4 py-10',
        centered ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-lg bg-danger-soft text-danger">
        <CircleAlert className="size-6" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div className={cn('flex max-w-md flex-col gap-1', centered && 'items-center')}>
        <h3 className="text-lg font-semibold text-fg">{title}</h3>
        {description && <div className="text-sm text-fg-muted text-pretty">{description}</div>}
      </div>
      {(onRetry || action) && (
        <div className={cn('flex flex-wrap items-center gap-2', centered && 'justify-center')}>
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              <RotateCw strokeWidth={1.75} aria-hidden="true" />
              {retryLabel}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  )
}
