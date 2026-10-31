'use client'

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  options: SegmentedOption<T>[]
  size?: 'sm' | 'md'
  /** Show only icons; labels stay available to screen readers. */
  iconOnly?: boolean
  className?: string
  id?: string
  'aria-label': string
}

/** A compact single-choice switcher (radio group semantics, arrow-key navigation). */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  size = 'md',
  iconOnly = false,
  className,
  id,
  ...aria
}: SegmentedControlProps<T>) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0)
  const selectedIndex = options.findIndex((o) => o.value === value)
  const tabStop = selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : enabled[0]

  const select = (index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    onValueChange(option.value)
    refs.current[index]?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const pos = enabled.indexOf(index)
    let next: number | undefined
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = enabled[(pos + 1) % enabled.length]
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = enabled[(pos - 1 + enabled.length) % enabled.length]
    else if (event.key === 'Home') next = enabled[0]
    else if (event.key === 'End') next = enabled[enabled.length - 1]
    if (next !== undefined) {
      event.preventDefault()
      select(next)
    }
  }

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={aria['aria-label']}
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md bg-sunken p-0.5 scrollbar-none',
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={iconOnly ? option.label : undefined}
            disabled={option.disabled}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium',
              'transition-[color,background-color,box-shadow] duration-120 ease-out',
              'outline-none focus-visible:ring-2 focus-visible:ring-accent',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
              iconOnly && (size === 'sm' ? 'w-7 px-0' : 'w-8 px-0'),
              selected
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {Icon && <Icon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />}
            {!iconOnly && option.label}
          </button>
        )
      })}
    </div>
  )
}
