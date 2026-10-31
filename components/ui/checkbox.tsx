'use client'

import * as React from 'react'
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CheckboxProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  indeterminate?: boolean
  id?: string
  name?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-describedby'?: string
}

export function Checkbox({
  checked,
  onCheckedChange,
  indeterminate,
  id,
  name,
  disabled,
  className,
  ...aria
}: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      id={id}
      name={name}
      checked={checked}
      indeterminate={indeterminate}
      disabled={disabled}
      onCheckedChange={(next) => onCheckedChange(next)}
      aria-label={aria['aria-label']}
      aria-describedby={aria['aria-describedby']}
      className={cn(
        'peer inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-surface text-accent-fg shadow-xs',
        'transition-colors duration-120 ease-out focus-ring-surface',
        'hover:border-fg-subtle',
        'data-[checked]:border-accent data-[checked]:bg-accent data-[indeterminate]:border-accent data-[indeterminate]:bg-accent',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        className,
      )}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center data-[unchecked]:hidden">
        {indeterminate ? (
          <Minus className="size-3" strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
