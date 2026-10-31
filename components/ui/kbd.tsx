import * as React from 'react'
import { cn } from '@/lib/utils'

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line border-b-line-strong bg-surface px-1',
        'font-mono text-xs font-medium leading-none text-fg-muted',
        className,
      )}
      {...props}
    />
  )
}
