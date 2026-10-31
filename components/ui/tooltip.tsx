'use client'

import * as React from 'react'
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'
import { cn } from '@/lib/utils'

/** Mounted once in the root layout so neighbouring tooltips open without a second delay. */
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delay={400} closeDelay={0}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

export interface TooltipProps {
  content: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  /** The trigger. It must accept a ref and spread props (Button, ButtonLink, a DOM element). */
  children: React.ReactElement
  className?: string
}

export function Tooltip({ content, side = 'top', align = 'center', children, className }: TooltipProps) {
  if (content === null || content === undefined || content === false || content === '') return children
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} align={align} sideOffset={6} collisionPadding={8} className="z-toast">
          <TooltipPrimitive.Popup
            className={cn(
              'max-w-[260px] rounded-md bg-fg px-2 py-1 text-xs font-medium text-canvas shadow-md',
              'origin-[var(--transform-origin)] transition-opacity duration-120 ease-out',
              'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
              'data-[instant]:transition-none',
              className,
            )}
          >
            {content}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
