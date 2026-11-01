'use client'

import * as React from 'react'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { cn } from '@/lib/utils'

export const Popover = PopoverPrimitive.Root

export function PopoverTrigger({
  className,
  ...props
}: Omit<PopoverPrimitive.Trigger.Props, 'className'> & { className?: string }) {
  return <PopoverPrimitive.Trigger className={className} {...props} />
}

/** Popup surface with the shared enter/exit transition used by menus and selects. */
export const floatingPanelClass = cn(
  'rounded-lg border border-line bg-surface text-fg shadow-md outline-none',
  'origin-[var(--transform-origin)] transition-[opacity,transform] duration-180 ease-out',
  'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-160 data-[ending-style]:ease-in',
  'data-[side=bottom]:data-[starting-style]:-translate-y-1 data-[side=top]:data-[starting-style]:translate-y-1',
  'data-[side=left]:data-[starting-style]:translate-x-1 data-[side=right]:data-[starting-style]:-translate-x-1',
)

export interface PopoverContentProps
  extends Omit<PopoverPrimitive.Popup.Props, 'className' | 'children'> {
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  className?: string
  children?: React.ReactNode
}

export function PopoverContent({
  side = 'bottom',
  align = 'center',
  sideOffset = 8,
  className,
  children,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className="z-overlay"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(floatingPanelClass, 'w-72 max-w-[calc(100vw-2rem)] p-4', className)}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export function PopoverTitle({
  className,
  ...props
}: Omit<PopoverPrimitive.Title.Props, 'className'> & { className?: string }) {
  return <PopoverPrimitive.Title className={cn('text-sm font-semibold text-fg', className)} {...props} />
}

export function PopoverDescription({
  className,
  ...props
}: Omit<PopoverPrimitive.Description.Props, 'className'> & { className?: string }) {
  return (
    <PopoverPrimitive.Description className={cn('mt-1 text-sm text-fg-muted', className)} {...props} />
  )
}

export const PopoverClose = PopoverPrimitive.Close
