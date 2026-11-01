import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * The commit-node mark: a branch rail with a hollow commit at its base that
 * curves out to a filled accent node, the post. Strokes use currentColor so
 * the mark follows the text colour; only the tip node is accent.
 */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <path d="M7 3.25v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="7" cy="17.75" r="2.75" stroke="currentColor" strokeWidth="2" />
      <path
        d="M7 12.25c0-3.45 2.3-5.5 6.25-5.5H14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="17.75" cy="6.75" r="3.5" className="fill-accent" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('text-lg font-bold leading-none tracking-tight text-current', className)}>
      CommitFlex
    </span>
  )
}

export interface LogoProps {
  /** Wraps the logo in a link. Omit for a static logo. */
  href?: string
  className?: string
  showWordmark?: boolean
  size?: number
}

export function Logo({ href, className, showWordmark = true, size = 22 }: LogoProps) {
  const content = (
    <>
      <LogoMark size={size} />
      {showWordmark && <Wordmark />}
    </>
  )
  const classes = cn('inline-flex items-center gap-2 text-fg', className)

  if (href) {
    return (
      <Link href={href} aria-label="CommitFlex home" className={cn(classes, 'rounded-md focus-ring')}>
        {content}
      </Link>
    )
  }
  return (
    <span className={classes} role="img" aria-label="CommitFlex">
      {content}
    </span>
  )
}
