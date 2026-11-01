'use client'

import * as React from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption<T extends string> {
  value: T
  label: string
  description?: string
  disabled?: boolean
}

export interface SelectProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  options: SelectOption<T>[]
  placeholder?: string
  id?: string
  name?: string
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

/**
 * Single-value select built on base-ui. Pass `value=""` to show the
 * placeholder.
 */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  id,
  name,
  disabled,
  size = 'md',
  className,
  ...aria
}: SelectProps<T>) {
  const items = React.useMemo(
    () => options.map((o) => ({ value: o.value, label: o.label })),
    [options],
  )

  return (
    <SelectPrimitive.Root
      items={items}
      value={value === '' ? null : value}
      onValueChange={(next) => {
        if (next !== null && next !== undefined) onValueChange(next as T)
      }}
      disabled={disabled}
      name={name}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid']}
        className={cn(
          'group flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-line-strong bg-surface text-left text-fg shadow-xs',
          'transition-[border-color,box-shadow] duration-120 ease-out hover:border-fg-subtle/60',
          'outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25',
          'data-[popup-open]:border-accent',
          'data-[disabled]:cursor-not-allowed data-[disabled]:bg-sunken data-[disabled]:text-fg-subtle',
          'aria-[invalid=true]:border-danger',
          size === 'sm' ? 'h-8 px-2.5 text-sm' : 'h-9 px-3 text-base sm:text-sm',
          className,
        )}
      >
        <SelectPrimitive.Value
          placeholder={placeholder}
          className="truncate data-[placeholder]:text-fg-subtle"
        />
        <SelectPrimitive.Icon className="shrink-0 text-fg-subtle">
          <ChevronsUpDown className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          sideOffset={6}
          alignItemWithTrigger={false}
          className="z-overlay outline-none"
        >
          <SelectPrimitive.Popup
            className={cn(
              'max-h-[min(360px,var(--available-height))] min-w-[var(--anchor-width)] max-w-[calc(100vw-2rem)] overflow-y-auto',
              'rounded-lg border border-line bg-surface p-1 text-fg shadow-md outline-none',
              'origin-[var(--transform-origin)] transition-[opacity,transform] duration-180 ease-out',
              'data-[starting-style]:-translate-y-1 data-[starting-style]:opacity-0',
              'data-[ending-style]:opacity-0 data-[ending-style]:duration-160 data-[ending-style]:ease-in',
            )}
          >
            <SelectPrimitive.List>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  label={option.label}
                  className={cn(
                    'relative flex cursor-default select-none items-start gap-2 rounded-md py-1.5 pl-2 pr-8 text-sm outline-none',
                    'data-[highlighted]:bg-sunken data-[selected]:font-medium',
                    'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
                  )}
                >
                  <div className="flex min-w-0 flex-col">
                    <SelectPrimitive.ItemText className="truncate">{option.label}</SelectPrimitive.ItemText>
                    {option.description && (
                      <span className="text-xs font-normal text-fg-muted">{option.description}</span>
                    )}
                  </div>
                  <SelectPrimitive.ItemIndicator className="absolute right-2 top-2 text-accent">
                    <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
