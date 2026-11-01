'use client'

import * as React from 'react'
import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { cn } from '@/lib/utils'

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  id?: string
  name?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-describedby'?: string
}

export function Switch({
  checked,
  onCheckedChange,
  id,
  name,
  disabled,
  className,
  ...aria
}: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      id={id}
      name={name}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(next) => onCheckedChange(next)}
      aria-label={aria['aria-label']}
      aria-describedby={aria['aria-describedby']}
      className={cn(
        'peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-line-strong p-0.5',
        'transition-colors duration-120 ease-out focus-ring',
        'data-[checked]:bg-accent',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block size-4 rounded-full bg-white shadow-sm',
          'transition-transform duration-180 ease-out',
          'data-[checked]:translate-x-4',
        )}
      />
    </SwitchPrimitive.Root>
  )
}
