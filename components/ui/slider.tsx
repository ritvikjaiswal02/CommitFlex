'use client'

import * as React from 'react'
import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { cn } from '@/lib/utils'

export interface SliderProps {
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  id?: string
  className?: string
  'aria-label': string
  /** Text read out for the current value, e.g. `(v) => \`Level ${v} of 10\``. */
  getAriaValueText?: (value: number) => string
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  id,
  className,
  getAriaValueText,
  ...aria
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      value={value}
      onValueChange={(next) => onValueChange(Array.isArray(next) ? (next[0] as number) : (next as number))}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={cn('w-full touch-none select-none data-[disabled]:opacity-50', className)}
    >
      <SliderPrimitive.Control className="flex h-5 w-full items-center">
        <SliderPrimitive.Track className="relative h-1 w-full rounded-full bg-sunken">
          <SliderPrimitive.Indicator className="rounded-full bg-accent" />
          <SliderPrimitive.Thumb
            id={id}
            getAriaLabel={() => aria['aria-label']}
            getAriaValueText={getAriaValueText ? (_formatted, v) => getAriaValueText(v) : undefined}
            className={cn(
              'size-4 rounded-full border border-line-strong bg-surface shadow-sm',
              'transition-[box-shadow,border-color] duration-120 ease-out',
              'hover:border-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-canvas',
              'data-[dragging]:border-accent',
            )}
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}
