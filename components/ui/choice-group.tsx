'use client'

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ChoiceOption<T extends string> {
  value: T
  label: string
  description?: string
  icon?: LucideIcon
  badge?: React.ReactNode
  disabled?: boolean
}

interface ChoiceGroupBaseProps<T extends string> {
  options: ChoiceOption<T>[]
  /** Upper bound on selections when `multiple` is set. */
  max?: number
  columns?: 1 | 2 | 3
  className?: string
  id?: string
  'aria-label': string
  'aria-describedby'?: string
}

export type ChoiceGroupProps<T extends string> = ChoiceGroupBaseProps<T> & {
  value: T | T[]
  onChange: (value: T | T[]) => void
  multiple?: boolean
}

const COLUMNS: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
}

/**
 * Selectable option cards. Single mode behaves like a radio group (arrow keys
 * move and select); multiple mode behaves like a set of checkboxes (arrow keys
 * move, Space toggles).
 */
export function ChoiceGroup<T extends string>({
  value,
  onChange,
  options,
  multiple = false,
  max,
  columns = 1,
  className,
  id,
  ...aria
}: ChoiceGroupProps<T>) {
  const selected = React.useMemo<T[]>(
    () => (Array.isArray(value) ? value : value ? [value] : []),
    [value],
  )
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const atMax = multiple && max !== undefined && selected.length >= max

  const enabledIndexes = options
    .map((o, i) => (o.disabled ? -1 : i))
    .filter((i) => i >= 0)

  const firstSelectedIndex = options.findIndex((o) => selected.includes(o.value) && !o.disabled)
  const [focusIndex, setFocusIndex] = React.useState<number>(
    firstSelectedIndex >= 0 ? firstSelectedIndex : (enabledIndexes[0] ?? 0),
  )

  const toggle = (option: ChoiceOption<T>) => {
    if (option.disabled) return
    if (!multiple) {
      if (!selected.includes(option.value)) onChange(option.value)
      return
    }
    if (selected.includes(option.value)) {
      onChange(selected.filter((v) => v !== option.value))
    } else if (!atMax) {
      onChange([...selected, option.value])
    }
  }

  const moveFocus = (from: number, delta: number) => {
    if (enabledIndexes.length === 0) return
    const pos = enabledIndexes.indexOf(from)
    const nextPos =
      pos === -1 ? 0 : (pos + delta + enabledIndexes.length) % enabledIndexes.length
    const next = enabledIndexes[nextPos]
    setFocusIndex(next)
    refs.current[next]?.focus()
    if (!multiple) toggle(options[next])
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault()
        moveFocus(index, 1)
        break
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault()
        moveFocus(index, -1)
        break
      case 'Home':
        event.preventDefault()
        moveFocus(enabledIndexes[0], 0)
        break
      case 'End':
        event.preventDefault()
        moveFocus(enabledIndexes[enabledIndexes.length - 1], 0)
        break
      default:
        break
    }
  }

  return (
    <div
      id={id}
      role={multiple ? 'group' : 'radiogroup'}
      aria-label={aria['aria-label']}
      aria-describedby={aria['aria-describedby']}
      className={cn('grid gap-2', COLUMNS[columns], className)}
    >
      {options.map((option, index) => {
        const isSelected = selected.includes(option.value)
        const blocked = option.disabled || (!isSelected && atMax)
        const Icon = option.icon
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node
            }}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={isSelected}
            aria-disabled={blocked || undefined}
            disabled={option.disabled}
            tabIndex={multiple ? 0 : index === focusIndex ? 0 : -1}
            onFocus={() => setFocusIndex(index)}
            onClick={() => toggle(option)}
            onKeyDown={(e) => onKeyDown(e, index)}
            data-selected={isSelected || undefined}
            className={cn(
              'group relative flex w-full items-start gap-3 rounded-lg border bg-surface p-4 text-left',
              'transition-[border-color,background-color,box-shadow] duration-120 ease-out focus-ring',
              isSelected
                ? 'border-accent bg-accent-soft/50 shadow-[inset_0_0_0_1px_rgb(var(--c-accent))]'
                : 'border-line hover:border-line-strong',
              blocked && 'cursor-not-allowed opacity-50 hover:border-line',
            )}
          >
            {Icon && (
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-md transition-colors duration-120',
                  isSelected ? 'bg-surface text-accent' : 'bg-sunken text-fg-muted',
                )}
              >
                <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <span className="text-base font-medium leading-6 text-fg">{option.label}</span>
                {option.badge}
              </span>
              {option.description && (
                <span className="text-sm text-fg-muted">{option.description}</span>
              )}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'mt-1 flex size-4 shrink-0 items-center justify-center border transition-colors duration-120',
                multiple ? 'rounded-sm' : 'rounded-full',
                isSelected ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong bg-surface',
              )}
            >
              {isSelected &&
                (multiple ? (
                  <Check className="size-3" strokeWidth={2.5} />
                ) : (
                  <span className="size-1.5 rounded-full bg-accent-fg" />
                ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}
