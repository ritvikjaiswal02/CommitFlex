import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger'

const TONE: Record<CalloutTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: 'border-accent/20 bg-accent-soft/60', icon: 'text-accent', Icon: Info },
  success: { box: 'border-success/20 bg-success-soft', icon: 'text-success', Icon: CircleCheck },
  warning: { box: 'border-warning/25 bg-warning-soft', icon: 'text-warning', Icon: TriangleAlert },
  danger: { box: 'border-danger/20 bg-danger-soft', icon: 'text-danger', Icon: CircleAlert },
}

export interface CalloutProps {
  tone: CalloutTone
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
  icon?: LucideIcon
  className?: string
}

/** An inline notice: a reconnect banner, a limit warning, a tip. */
export function Callout({ tone, title, children, action, icon, className }: CalloutProps) {
  const meta = TONE[tone]
  const Icon = icon ?? meta.Icon
  return (
    <div
      data-slot="callout"
      data-tone={tone}
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start',
        meta.box,
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon className={cn('mt-0.5 size-4 shrink-0', meta.icon)} strokeWidth={1.75} aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-semibold text-fg">{title}</p>
          {children && <div className="text-sm text-fg-muted">{children}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">{action}</div>}
    </div>
  )
}
