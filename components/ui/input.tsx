import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Shared field chrome for text-like controls (input, textarea, select trigger). */
export const fieldControlClass = cn(
  'w-full min-w-0 rounded-md border border-line-strong bg-surface text-base text-fg shadow-xs sm:text-sm',
  'transition-[border-color,box-shadow] duration-120 ease-out',
  'placeholder:text-fg-subtle',
  'hover:border-fg-subtle/60',
  'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25',
  'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-fg-subtle disabled:hover:border-line-strong',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/25',
)

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Icon drawn inside the left edge. */
  leadingIcon?: LucideIcon
  /** Content inside the right edge: a unit, a Kbd, a clear button. */
  trailing?: React.ReactNode
  invalid?: boolean
}

/**
 * Text input. Without adornments `className` goes on the input; with a
 * leading icon or trailing content it goes on the wrapper that draws the box.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leadingIcon: LeadingIcon, trailing, invalid, type = 'text', ...props },
  ref,
) {
  const hasAdornment = Boolean(LeadingIcon) || trailing != null
  const input = (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      {...props}
      aria-invalid={invalid ? true : props['aria-invalid']}
      className={cn(
        fieldControlClass,
        'h-9 px-3',
        'file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg',
        LeadingIcon && 'pl-9',
        trailing != null && 'pr-10',
        !hasAdornment && className,
      )}
    />
  )

  if (!hasAdornment) return input

  return (
    <div data-slot="input-wrapper" className={cn('relative flex w-full items-center', className)}>
      {LeadingIcon && (
        <LeadingIcon
          aria-hidden="true"
          strokeWidth={1.75}
          className="pointer-events-none absolute left-3 size-4 text-fg-subtle"
        />
      )}
      {input}
      {trailing != null && (
        <div className="absolute inset-y-0 right-1.5 flex items-center gap-1 text-sm text-fg-subtle">
          {trailing}
        </div>
      )}
    </div>
  )
})
