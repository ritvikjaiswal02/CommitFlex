import * as React from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Hover feedback for cards that are links or buttons. Border only, no transform. */
  interactive?: boolean
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-slot="card"
      className={cn(
        'flex flex-col rounded-lg border border-line bg-surface text-fg',
        '[&>[data-slot=card-header]+[data-slot=card-content]]:pt-0',
        interactive && 'transition-colors duration-120 ease-out hover:border-line-strong',
        className,
      )}
      {...props}
    />
  )
})

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex items-start gap-4 p-4 sm:p-5', className)}
      {...props}
    />
  )
}

export function CardTitle({
  className,
  as: Tag = 'h3',
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' | 'h4' | 'div' }) {
  return (
    <Tag
      data-slot="card-title"
      className={cn('text-base font-semibold leading-6 text-fg', className)}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="card-description"
      className={cn('mt-0.5 text-sm text-fg-muted', className)}
      {...props}
    />
  )
}

/** Right-aligned slot inside CardHeader for a button or menu. */
export function CardAction({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-action"
      className={cn('ml-auto flex shrink-0 items-center gap-2', className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn('flex-1 p-4 sm:p-5', className)} {...props} />
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-2 border-t border-line px-4 py-3 sm:px-5', className)}
      {...props}
    />
  )
}
