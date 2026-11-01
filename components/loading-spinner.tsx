import { cn } from '@/lib/utils'
import { Spinner, type SpinnerSize } from '@/components/ui/spinner'

interface LoadingSpinnerProps {
  /** Visible text next to the spinner, also announced to screen readers. */
  label?: string
  className?: string
  /** Kept for older call sites. */
  size?: 'sm' | 'md' | 'lg'
}

const SIZE: Record<NonNullable<LoadingSpinnerProps['size']>, SpinnerSize> = {
  sm: 14,
  md: 16,
  lg: 24,
}

/** Compatibility wrapper around Spinner. Prefer Skeletons shaped like the content for page loads. */
export function LoadingSpinner({ label, className, size = 'md' }: LoadingSpinnerProps) {
  if (!label) {
    return <Spinner size={SIZE[size]} label="Loading" className={cn('text-fg-subtle', className)} />
  }
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-fg-muted', className)}>
      <Spinner size={SIZE[size]} className="text-fg-subtle" />
      <span>{label}</span>
    </span>
  )
}
