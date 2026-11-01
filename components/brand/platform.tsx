import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Brand marks for the platforms CommitFlex reads from and posts to.
 * lucide-react ships no brand icons, so these are inline SVGs. Platform
 * colours appear only here and in PlatformBadge, never as decoration.
 */
export type BrandPlatform = 'linkedin' | 'twitter' | 'github'

export const PLATFORM_CHAR_LIMIT = { linkedin: 3000, twitter: 280 } as const

export function platformLabel(p: 'linkedin' | 'twitter'): 'LinkedIn' | 'X' {
  return p === 'linkedin' ? 'LinkedIn' : 'X'
}

const PATHS: Record<BrandPlatform, { viewBox: string; d: string; color: string; name: string }> = {
  linkedin: {
    viewBox: '0 0 24 24',
    name: 'LinkedIn',
    color: 'text-linkedin',
    d: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  },
  twitter: {
    viewBox: '0 0 24 24',
    name: 'X',
    color: 'text-x',
    d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  github: {
    viewBox: '0 0 16 16',
    name: 'GitHub',
    color: 'text-current',
    d: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z',
  },
}

export interface PlatformIconProps {
  platform: BrandPlatform
  className?: string
  /** Accessible name. Without it the icon is decorative. */
  title?: string
  /** Use the platform's brand colour (default) or inherit currentColor. */
  colored?: boolean
}

export function PlatformIcon({ platform, className, title, colored = true }: PlatformIconProps) {
  const meta = PATHS[platform]
  return (
    <svg
      viewBox={meta.viewBox}
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('size-4 shrink-0', colored && meta.color, className)}
    >
      {title && <title>{title}</title>}
      <path d={meta.d} />
    </svg>
  )
}

export function PlatformBadge({ platform, className }: { platform: 'linkedin' | 'twitter'; className?: string }) {
  return (
    <span
      data-slot="platform-badge"
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-sm border border-line bg-surface px-1.5 text-xs font-medium text-fg-muted',
        className,
      )}
    >
      <PlatformIcon platform={platform} className="size-3.5" />
      {platformLabel(platform)}
    </span>
  )
}
