import * as React from 'react'
import { cn } from '@/lib/utils'

/** Placeholder block. Shape it like the content it stands in for. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse-soft rounded-md bg-sunken', className)}
      {...props}
    />
  )
}
