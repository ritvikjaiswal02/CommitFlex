'use client'

import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { closeButtonClass, overlayClass } from '@/components/ui/dialog'

/** A panel that slides in from an edge. Editors open in a right sheet so lists keep context. */
export const Sheet = DialogPrimitive.Root

export function SheetTrigger({
  className,
  ...props
}: Omit<DialogPrimitive.Trigger.Props, 'className'> & { className?: string }) {
  return <DialogPrimitive.Trigger className={className} {...props} />
}

export function SheetClose({
  className,
  ...props
}: Omit<DialogPrimitive.Close.Props, 'className'> & { className?: string }) {
  return <DialogPrimitive.Close className={className} {...props} />
}

type SheetSide = 'right' | 'left' | 'bottom'
type SheetSize = 'md' | 'lg'

const SIDE: Record<SheetSide, string> = {
  right: cn(
    'inset-y-2 right-2 w-[calc(100vw-1rem)]',
    'data-[starting-style]:translate-x-4 data-[ending-style]:translate-x-4',
  ),
  left: cn(
    'inset-y-2 left-2 w-[calc(100vw-1rem)]',
    'data-[starting-style]:-translate-x-4 data-[ending-style]:-translate-x-4',
  ),
  bottom: cn(
    'inset-x-2 bottom-2 max-h-[85dvh]',
    'data-[starting-style]:translate-y-4 data-[ending-style]:translate-y-4',
  ),
}

const SIZE: Record<SheetSide, Record<SheetSize, string>> = {
  right: { md: 'sm:max-w-[480px]', lg: 'sm:max-w-[720px]' },
  left: { md: 'max-w-[320px]', lg: 'sm:max-w-[480px]' },
  bottom: { md: '', lg: '' },
}

export interface SheetContentProps
  extends Omit<DialogPrimitive.Popup.Props, 'className' | 'children'> {
  side?: SheetSide
  size?: SheetSize
  showClose?: boolean
  className?: string
  children?: React.ReactNode
}

export function SheetContent({
  side = 'right',
  size = 'md',
  showClose = true,
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className={overlayClass} />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          'fixed z-overlay flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-fg shadow-lg outline-none',
          'transition-[opacity,transform] duration-240 ease-out',
          'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-160 data-[ending-style]:ease-in',
          SIDE[side],
          SIZE[side][size],
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close aria-label="Close" className={closeButtonClass}>
            <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1 border-b border-line px-5 py-4 pr-12', className)}
      {...props}
    />
  )
}

export function SheetTitle({
  className,
  ...props
}: Omit<DialogPrimitive.Title.Props, 'className'> & { className?: string }) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold text-fg', className)} {...props} />
}

export function SheetDescription({
  className,
  ...props
}: Omit<DialogPrimitive.Description.Props, 'className'> & { className?: string }) {
  return (
    <DialogPrimitive.Description className={cn('text-sm text-fg-muted', className)} {...props} />
  )
}

export function SheetBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-body"
      className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-5', className)}
      {...props}
    />
  )
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}
