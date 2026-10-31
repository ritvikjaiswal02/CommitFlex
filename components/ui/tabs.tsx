'use client'

import * as React from 'react'
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cn } from '@/lib/utils'

export interface TabsProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  className?: string
  children: React.ReactNode
}

/** Underline tabs. Controlled (`value` + `onValueChange`) or uncontrolled (`defaultValue`). */
export function Tabs({ value, defaultValue, onValueChange, className, children }: TabsProps) {
  return (
    <TabsPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange ? (next) => onValueChange(String(next)) : undefined}
      className={cn('flex flex-col gap-6', className)}
    >
      {children}
    </TabsPrimitive.Root>
  )
}

export function TabsList({
  className,
  children,
  'aria-label': ariaLabel,
}: {
  className?: string
  children: React.ReactNode
  'aria-label'?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = React.useState(false)

  // A row of tabs wider than the screen scrolls sideways. Fade the right edge
  // while there's more to the right, so hidden tabs don't look missing, and
  // bring the active tab into view on mount.
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setOverflow(el.scrollWidth - el.clientWidth - el.scrollLeft > 4)
    update()
    const active = el.querySelector<HTMLElement>('[data-active]')
    if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    el.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    observer?.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [])

  return (
    <TabsPrimitive.List
      ref={ref}
      aria-label={ariaLabel}
      data-overflow={overflow || undefined}
      className={cn(
        'relative flex items-stretch gap-5 overflow-x-auto border-b border-line scrollbar-none',
        'data-[overflow]:[mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]',
        className,
      )}
    >
      {children}
      <TabsPrimitive.Indicator
        className={cn(
          'absolute bottom-0 left-0 h-0.5 rounded-full bg-accent',
          'w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)]',
          'transition-[transform,width] duration-180 ease-out',
        )}
      />
    </TabsPrimitive.List>
  )
}

export interface TabsTriggerProps {
  value: string
  count?: number
  /** Shorter label shown below `sm`, so every tab fits on a phone. */
  shortLabel?: string
  disabled?: boolean
  className?: string
  children: React.ReactNode
}

export function TabsTrigger({ value, count, shortLabel, disabled, className, children }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Tab
      value={value}
      disabled={disabled}
      className={cn(
        'relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm text-sm font-medium text-fg-muted',
        'transition-colors duration-120 ease-out hover:text-fg',
        'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
        'data-[active]:text-fg data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        className,
      )}
    >
      {shortLabel ? (
        <>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{children}</span>
        </>
      ) : (
        children
      )}
      {count !== undefined && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-sunken px-1.5 text-xs tabular-nums text-fg-muted">
          {count}
        </span>
      )}
    </TabsPrimitive.Tab>
  )
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <TabsPrimitive.Panel value={value} className={cn('outline-none', className)}>
      {children}
    </TabsPrimitive.Panel>
  )
}
