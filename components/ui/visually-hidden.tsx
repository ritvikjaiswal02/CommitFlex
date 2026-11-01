import * as React from 'react'

/** Content for screen readers only. */
export function VisuallyHidden({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className="sr-only" {...props}>
      {children}
    </span>
  )
}
