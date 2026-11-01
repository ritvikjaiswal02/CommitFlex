import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
  /** Purely visual separators are hidden from assistive tech (the default). */
  decorative?: boolean
}

export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <div
      data-slot="separator"
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        'shrink-0 bg-line',
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch',
        className,
      )}
      {...props}
    />
  )
}
