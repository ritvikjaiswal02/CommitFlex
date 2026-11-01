'use client'

import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Shared backdrop for dialogs, alert dialogs and sheets. */
export const overlayClass = cn(
  'fixed inset-0 z-overlay bg-scrim/40 dark:bg-scrim/70',
  'transition-opacity duration-240 ease-out',
  'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-160 data-[ending-style]:ease-in',
)

/** Close button used in the corner of dialogs and sheets. */
export const closeButtonClass = cn(
  'absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-fg-subtle',
  'transition-colors duration-120 hover:bg-sunken hover:text-fg focus-ring-surface',
)

export const Dialog = DialogPrimitive.Root

export function DialogTrigger({
  className,
  ...props
}: Omit<DialogPrimitive.Trigger.Props, 'className'> & { className?: string }) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" className={className} {...props} />
}

export function DialogClose({
  className,
  ...props
}: Omit<DialogPrimitive.Close.Props, 'className'> & { className?: string }) {
  return <DialogPrimitive.Close data-slot="dialog-close" className={className} {...props} />
}

const DIALOG_SIZE = {
  sm: 'sm:max-w-[400px]',
  md: 'sm:max-w-[520px]',
  lg: 'sm:max-w-[680px]',
} as const

export interface DialogContentProps
  extends Omit<DialogPrimitive.Popup.Props, 'className' | 'children'> {
  size?: keyof typeof DIALOG_SIZE
  showClose?: boolean
  className?: string
  children?: React.ReactNode
}

export function DialogContent({
  size = 'md',
  showClose = true,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className={overlayClass} />
      <DialogPrimitive.Viewport className="fixed inset-0 z-overlay flex items-end justify-center p-2 sm:items-center sm:p-6">
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn(
            'relative flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-xl border border-line bg-surface text-fg shadow-lg outline-none sm:max-h-[calc(100dvh-3rem)]',
            DIALOG_SIZE[size],
            'transition-[opacity,transform] duration-240 ease-out',
            'data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0',
            'data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[ending-style]:duration-160 data-[ending-style]:ease-in',
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
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-1.5 px-5 pb-4 pr-12 pt-5 sm:px-6 sm:pr-12 sm:pt-6', className)}
      {...props}
    />
  )
}

export function DialogTitle({
  className,
  ...props
}: Omit<DialogPrimitive.Title.Props, 'className'> & { className?: string }) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-xl font-semibold text-fg', className)}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: Omit<DialogPrimitive.Description.Props, 'className'> & { className?: string }) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-fg-muted', className)}
      {...props}
    />
  )
}

/** Scrollable middle section of a dialog. */
export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-body"
      className={cn('min-h-0 flex-1 overflow-y-auto px-5 pb-5 first:pt-5 sm:px-6 sm:pb-6 sm:first:pt-6', className)}
      {...props}
    />
  )
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6',
        className,
      )}
      {...props}
    />
  )
}
