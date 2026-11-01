'use client'

import * as React from 'react'
import { Toast } from '@base-ui/react/toast'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * App-wide toasts. `toast()` can be called from any client code (event
 * handlers, hooks, fetch helpers) because it talks to a module-level manager;
 * <Toaster /> is mounted once in the root layout and renders the stack.
 *
 * Copy rule: reuse the action's verb in past tense ("Approved",
 * "Scheduled for Tue, 9:30", "Published to LinkedIn").
 */
const manager = Toast.createToastManager()

type ToastKind = 'default' | 'success' | 'error' | 'info'

export interface ToastOptions {
  description?: string
  action?: { label: string; onClick: () => void }
  /** Milliseconds before auto-dismiss. 0 keeps it open. Default 5000 (errors 8000). */
  duration?: number
  /** Re-using an id updates that toast in place. */
  id?: string
}

function show(kind: ToastKind, title: string, opts: ToastOptions = {}): string {
  return manager.add({
    id: opts.id,
    title,
    description: opts.description,
    type: kind,
    priority: kind === 'error' ? 'high' : 'low',
    timeout: opts.duration ?? (kind === 'error' ? 8000 : 5000),
    actionProps: opts.action
      ? { children: opts.action.label, onClick: () => opts.action?.onClick() }
      : undefined,
  })
}

type ToastFn = ((title: string, opts?: ToastOptions) => string) & {
  success: (title: string, opts?: ToastOptions) => string
  error: (title: string, opts?: ToastOptions) => string
  info: (title: string, opts?: ToastOptions) => string
  dismiss: (id?: string) => void
}

export const toast: ToastFn = Object.assign(
  (title: string, opts?: ToastOptions) => show('default', title, opts),
  {
    success: (title: string, opts?: ToastOptions) => show('success', title, opts),
    error: (title: string, opts?: ToastOptions) => show('error', title, opts),
    info: (title: string, opts?: ToastOptions) => show('info', title, opts),
    dismiss: (id?: string) => manager.close(id),
  },
)

const ICON: Record<Exclude<ToastKind, 'default'>, { icon: typeof Info; className: string }> = {
  success: { icon: CircleCheck, className: 'text-success' },
  error: { icon: CircleAlert, className: 'text-danger' },
  info: { icon: Info, className: 'text-accent' },
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return (
    <>
      {toasts.map((t) => {
        const kind = (t.type ?? 'default') as ToastKind
        const meta = kind === 'default' ? null : ICON[kind]
        const Icon = meta?.icon
        return (
          <Toast.Root
            key={t.id}
            toast={t}
            swipeDirection="right"
            style={{
              transform:
                'translateX(var(--toast-swipe-movement-x, 0px)) translateY(var(--toast-enter-y, 0px))',
            }}
            className={cn(
              'pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border border-line bg-surface p-3.5 pr-11 text-fg shadow-md',
              'transition-[opacity,transform] duration-180 ease-out',
              'data-[starting-style]:opacity-0 data-[starting-style]:[--toast-enter-y:8px]',
              'data-[ending-style]:opacity-0 data-[ending-style]:duration-160 data-[ending-style]:ease-in',
              'data-[limited]:opacity-0 data-[swiping]:transition-none',
            )}
          >
            {Icon && (
              <Icon className={cn('mt-0.5 size-4 shrink-0', meta?.className)} strokeWidth={1.75} aria-hidden="true" />
            )}
            <Toast.Content className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Toast.Title className="text-sm font-medium text-fg" />
              <Toast.Description className="text-sm text-fg-muted empty:hidden" />
              {t.actionProps && (
                <div className="mt-2">
                  <Toast.Action
                    className={cn(
                      'inline-flex h-7 items-center rounded-md border border-line-strong bg-surface px-2.5 text-xs font-medium text-fg shadow-sm',
                      'transition-colors duration-120 hover:bg-sunken focus-ring-surface',
                    )}
                  />
                </div>
              )}
            </Toast.Content>
            <Toast.Close
              aria-label="Dismiss"
              className={cn(
                'absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md text-fg-subtle',
                'transition-colors duration-120 hover:bg-sunken hover:text-fg focus-ring-surface',
              )}
            >
              <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            </Toast.Close>
          </Toast.Root>
        )
      })}
    </>
  )
}

/** Mount once, in app/layout.tsx. */
export function Toaster() {
  return (
    <Toast.Provider toastManager={manager} limit={4}>
      <Toast.Portal>
        <Toast.Viewport
          className={cn(
            'pointer-events-none fixed inset-x-4 bottom-4 z-toast flex flex-col-reverse gap-2 outline-none',
            'sm:inset-x-auto sm:right-6 sm:w-[360px] sm:bottom-6',
          )}
        >
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}
