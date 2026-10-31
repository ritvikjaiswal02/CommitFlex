'use client'

import * as React from 'react'
import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar'
import { cn } from '@/lib/utils'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'

const SIZE: Record<AvatarSize, string> = {
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
}

/** Up to two initials from a display name or an email address. */
export function initialsFrom(name?: string | null): string {
  const source = (name ?? '').trim()
  if (!source) return '?'
  const base = source.includes('@') ? source.split('@')[0] : source
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export interface AvatarProps {
  src?: string | null
  name?: string | null
  size?: AvatarSize
  className?: string
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-accent-soft align-middle',
        SIZE[size],
        className,
      )}
    >
      {src && (
        <AvatarPrimitive.Image
          src={src}
          alt={name ? `${name}` : ''}
          className="size-full object-cover"
        />
      )}
      <AvatarPrimitive.Fallback
        className="flex size-full items-center justify-center font-semibold text-accent-ink"
        delay={src ? 400 : 0}
      >
        <span aria-hidden={name ? true : undefined}>{initialsFrom(name)}</span>
        {name && <span className="sr-only">{name}</span>}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}
