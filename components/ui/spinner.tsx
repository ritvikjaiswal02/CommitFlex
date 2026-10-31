import { cn } from '@/lib/utils'

export type SpinnerSize = 12 | 14 | 16 | 20 | 24

export interface SpinnerProps {
  size?: SpinnerSize
  /** Accessible label. When omitted the spinner is decorative (aria-hidden). */
  label?: string
  className?: string
}

/**
 * A quiet ring spinner: a faint full track with a quarter arc that turns.
 * Colour follows `currentColor`, so it inherits from buttons and text.
 */
export function Spinner({ size = 16, label, className }: SpinnerProps) {
  const svg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 motion-safe:animate-spin', !label && className)}
      style={{ animationDuration: '700ms' }}
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.75" />
      <path
        d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )

  if (!label) return svg

  return (
    <span role="status" className={cn('inline-flex items-center', className)}>
      {svg}
      <span className="sr-only">{label}</span>
    </span>
  )
}
