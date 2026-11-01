'use client'

import * as React from 'react'
import Link from 'next/link'
import { Menu } from '@base-ui/react/menu'
import type { LucideIcon } from 'lucide-react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { floatingPanelClass } from '@/components/ui/popover'

export const DropdownMenu = Menu.Root

export function DropdownMenuTrigger({
  className,
  ...props
}: Omit<Menu.Trigger.Props, 'className'> & { className?: string }) {
  return <Menu.Trigger className={className} {...props} />
}

export interface DropdownMenuContentProps extends Omit<Menu.Popup.Props, 'className' | 'children'> {
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
  className?: string
  children?: React.ReactNode
}

export function DropdownMenuContent({
  align = 'start',
  side = 'bottom',
  sideOffset = 6,
  className,
  children,
  ...props
}: DropdownMenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={12}
        className="z-overlay outline-none"
      >
        <Menu.Popup
          className={cn(
            floatingPanelClass,
            'min-w-[200px] max-w-[calc(100vw-2rem)] p-1',
            'max-h-[var(--available-height)] overflow-y-auto',
            className,
          )}
          {...props}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

const itemClass = cn(
  'flex h-8 w-full cursor-default select-none items-center gap-2 rounded-md px-2 text-sm text-fg outline-none',
  'data-[highlighted]:bg-sunken data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
)

export interface DropdownMenuItemProps
  extends Omit<Menu.Item.Props, 'className' | 'onClick' | 'children'> {
  icon?: LucideIcon
  variant?: 'default' | 'danger'
  /** Called when the item is chosen by pointer or keyboard. */
  onSelect?: () => void
  shortcut?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

export function DropdownMenuItem({
  icon: Icon,
  variant = 'default',
  onSelect,
  shortcut,
  className,
  children,
  ...props
}: DropdownMenuItemProps) {
  return (
    <Menu.Item
      onClick={onSelect ? () => onSelect() : undefined}
      className={cn(
        itemClass,
        variant === 'danger' && 'text-danger data-[highlighted]:bg-danger-soft',
        className,
      )}
      {...props}
    >
      {Icon && (
        <Icon
          className={cn('size-4 shrink-0', variant === 'danger' ? 'text-danger' : 'text-fg-subtle')}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="ml-auto pl-3 text-xs text-fg-subtle">{shortcut}</span>}
    </Menu.Item>
  )
}

export interface DropdownMenuLinkItemProps {
  href: string
  icon?: LucideIcon
  className?: string
  children?: React.ReactNode
  /** Opens in a new tab with rel="noopener noreferrer". */
  external?: boolean
}

export function DropdownMenuLinkItem({ href, icon: Icon, external, className, children }: DropdownMenuLinkItemProps) {
  return (
    <Menu.LinkItem
      closeOnClick
      render={
        external ? (
          <a href={href} target="_blank" rel="noopener noreferrer" />
        ) : (
          <Link href={href} />
        )
      }
      className={cn(itemClass, className)}
    >
      {Icon && <Icon className="size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Menu.LinkItem>
  )
}

export function DropdownMenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-2 pb-1 pt-2 text-xs font-medium text-fg-subtle', className)} {...props} />
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <Menu.Separator className={cn('-mx-1 my-1 h-px bg-line', className)} />
}

export interface DropdownMenuRadioGroupProps {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
  className?: string
}

export function DropdownMenuRadioGroup({ value, onValueChange, children, className }: DropdownMenuRadioGroupProps) {
  return (
    <Menu.RadioGroup
      value={value}
      onValueChange={(next) => onValueChange(String(next))}
      className={className}
    >
      {children}
    </Menu.RadioGroup>
  )
}

/** A menu item with a checkmark that toggles; the menu stays open. */
export function DropdownMenuCheckboxItem({
  checked,
  onCheckedChange,
  disabled,
  className,
  children,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  children?: React.ReactNode
}) {
  return (
    <Menu.CheckboxItem
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(Boolean(next))}
      disabled={disabled}
      closeOnClick={false}
      className={cn(itemClass, className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-sm border',
          checked ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong bg-surface',
        )}
      >
        <Menu.CheckboxItemIndicator>
          <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
        </Menu.CheckboxItemIndicator>
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </Menu.CheckboxItem>
  )
}

export function DropdownMenuRadioItem({
  value,
  icon: Icon,
  className,
  children,
}: {
  value: string
  icon?: LucideIcon
  className?: string
  children?: React.ReactNode
}) {
  return (
    <Menu.RadioItem value={value} closeOnClick={false} className={cn(itemClass, className)}>
      {Icon && <Icon className="size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <Menu.RadioItemIndicator className="ml-auto text-accent">
        <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
      </Menu.RadioItemIndicator>
    </Menu.RadioItem>
  )
}
