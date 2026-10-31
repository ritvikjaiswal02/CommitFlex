'use client'

import * as React from 'react'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'
import { Radio } from '@base-ui/react/radio'
import { cn } from '@/lib/utils'

export interface RadioGroupProps<T extends string = string> {
  value: T
  onValueChange: (value: T) => void
  name?: string
  disabled?: boolean
  className?: string
  children: React.ReactNode
  'aria-label'?: string
  'aria-labelledby'?: string
}

export function RadioGroup<T extends string = string>({
  value,
  onValueChange,
  name,
  disabled,
  className,
  children,
  ...aria
}: RadioGroupProps<T>) {
  return (
    <RadioGroupPrimitive
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      name={name}
      disabled={disabled}
      aria-label={aria['aria-label']}
      aria-labelledby={aria['aria-labelledby']}
      className={cn('flex flex-col gap-3', className)}
    >
      {children}
    </RadioGroupPrimitive>
  )
}

export interface RadioGroupItemProps {
  value: string
  id?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export function RadioGroupItem({ value, id, disabled, className, ...aria }: RadioGroupItemProps) {
  return (
    <Radio.Root
      value={value}
      id={id}
      disabled={disabled}
      aria-label={aria['aria-label']}
      className={cn(
        'peer inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface shadow-xs',
        'transition-colors duration-120 ease-out focus-ring-surface hover:border-fg-subtle',
        'data-[checked]:border-accent data-[checked]:bg-accent',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        className,
      )}
    >
      <Radio.Indicator className="size-1.5 rounded-full bg-accent-fg data-[unchecked]:hidden" />
    </Radio.Root>
  )
}
