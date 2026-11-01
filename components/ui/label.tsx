import * as React from 'react'
import { cn } from '@/lib/utils'

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  function Label({ className, ...props }, ref) {
    return (
      <label
        ref={ref}
        data-slot="label"
        className={cn(
          'inline-flex select-none items-center gap-1 text-sm font-medium text-fg',
          'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
          className,
        )}
        {...props}
      />
    )
  },
)
