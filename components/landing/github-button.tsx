'use client'

import * as React from 'react'
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/button'
import { PlatformIcon } from '@/components/brand/platform'
import { startWithGitHub } from '@/components/landing/actions'
import { cn } from '@/lib/utils'

export interface GitHubButtonProps {
  /** Where to go after GitHub sends the visitor back. Same-origin paths only. */
  next?: string
  children?: React.ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  fullWidth?: boolean
  /** Full width below the `sm` breakpoint only, for stacked mobile button groups. */
  mobileFullWidth?: boolean
  /** Hide the GitHub mark, e.g. inside dense pricing columns. */
  hideIcon?: boolean
}

/**
 * Sign in with GitHub through a server action. Works without JavaScript; with
 * it, the button shows a spinner while the redirect to GitHub is prepared.
 */
export function GitHubButton({
  next = '/dashboard',
  children = 'Start with GitHub',
  variant = 'primary',
  size = 'lg',
  className,
  fullWidth = false,
  mobileFullWidth = false,
  hideIcon = false,
}: GitHubButtonProps) {
  const [pending, setPending] = React.useState(false)

  // A back/forward cache restore would otherwise leave the spinner running.
  React.useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(false)
    }
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])

  return (
    <form
      action={startWithGitHub}
      onSubmit={() => setPending(true)}
      className={cn(fullWidth ? 'flex w-full' : mobileFullWidth ? 'flex w-full sm:inline-flex sm:w-auto' : 'inline-flex')}
    >
      <input type="hidden" name="next" value={next} />
      <Button
        type="submit"
        variant={variant}
        size={size}
        loading={pending}
        className={cn(fullWidth && 'w-full', mobileFullWidth && 'w-full sm:w-auto', className)}
      >
        {!pending && !hideIcon && <PlatformIcon platform="github" colored={false} className="size-4" />}
        {children}
      </Button>
    </form>
  )
}
