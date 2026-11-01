import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm font-medium tabular-nums [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        neutral: 'bg-sunken text-fg-muted',
        accent: 'bg-accent-soft text-accent-ink',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-danger',
        outline: 'border border-line text-fg-muted',
        marker: 'bg-marker text-marker-fg',
      },
      size: {
        sm: 'h-5 px-1.5 text-xs',
        md: 'h-6 px-2 text-sm',
      },
    },
    defaultVariants: { variant: 'neutral', size: 'sm' },
  },
)

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant, size }), className)} {...props} />
  )
}
