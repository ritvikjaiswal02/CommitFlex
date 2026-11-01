'use client'

import * as React from 'react'
import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog'
import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from '@/components/ui/button'
import { overlayClass } from '@/components/ui/dialog'

/** Confirmation dialog for destructive or irreversible actions. */
export const AlertDialog = AlertDialogPrimitive.Root

export function AlertDialogTrigger({
  className,
  ...props
}: Omit<AlertDialogPrimitive.Trigger.Props, 'className'> & { className?: string }) {
  return <AlertDialogPrimitive.Trigger className={className} {...props} />
}

export function AlertDialogContent({
  className,
  children,
  ...props
}: Omit<AlertDialogPrimitive.Popup.Props, 'className' | 'children'> & {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop className={overlayClass} />
      <AlertDialogPrimitive.Viewport className="fixed inset-0 z-overlay flex items-end justify-center p-2 sm:items-center sm:p-6">
        <AlertDialogPrimitive.Popup
          data-slot="alert-dialog-content"
          className={cn(
            'relative flex w-full flex-col overflow-hidden rounded-xl border border-line bg-surface text-fg shadow-lg outline-none sm:max-w-[440px]',
            'transition-[opacity,transform] duration-240 ease-out',
            'data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0',
            'data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[ending-style]:duration-160 data-[ending-style]:ease-in',
            className,
          )}
          {...props}
        >
          {children}
        </AlertDialogPrimitive.Popup>
      </AlertDialogPrimitive.Viewport>
    </AlertDialogPrimitive.Portal>
  )
}

export function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 px-5 pb-5 pt-5 sm:px-6 sm:pt-6', className)} {...props} />
}

export function AlertDialogTitle({
  className,
  ...props
}: Omit<AlertDialogPrimitive.Title.Props, 'className'> & { className?: string }) {
  return (
    <AlertDialogPrimitive.Title className={cn('text-lg font-semibold text-fg', className)} {...props} />
  )
}

export function AlertDialogDescription({
  className,
  ...props
}: Omit<AlertDialogPrimitive.Description.Props, 'className'> & { className?: string }) {
  return (
    <AlertDialogPrimitive.Description
      className={cn('text-sm text-fg-muted', className)}
      {...props}
    />
  )
}

export function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-6',
        className,
      )}
      {...props}
    />
  )
}

export function AlertDialogCancel({
  children = 'Cancel',
  className,
  ...props
}: Omit<ButtonProps, 'variant'>) {
  return (
    <AlertDialogPrimitive.Close
      render={<Button variant="secondary" className={className} {...props} />}
    >
      {children}
    </AlertDialogPrimitive.Close>
  )
}

export interface AlertDialogActionProps extends Omit<ButtonProps, 'variant'> {
  variant?: 'primary' | 'danger'
  /**
   * Close the dialog on click (default). Set to false for async actions and
   * close it yourself through the controlled `open` prop when the work is done.
   */
  closeOnClick?: boolean
}

export function AlertDialogAction({
  variant = 'primary',
  closeOnClick = true,
  className,
  children,
  ...props
}: AlertDialogActionProps) {
  if (!closeOnClick) {
    return (
      <Button variant={variant} className={className} {...props}>
        {children}
      </Button>
    )
  }
  return (
    <AlertDialogPrimitive.Close render={<Button variant={variant} className={className} {...props} />}>
      {children}
    </AlertDialogPrimitive.Close>
  )
}
