import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  /**
   * Below `md`, rows become stacked blocks and each TableCell with a `label`
   * shows it as a caption. On by default.
   */
  stackOnMobile?: boolean
  /** Classes for the bordered, scrollable wrapper. */
  containerClassName?: string
}

export function Table({ className, containerClassName, stackOnMobile = true, ...props }: TableProps) {
  return (
    <div
      data-slot="table-container"
      className={cn('w-full overflow-x-auto rounded-lg border border-line bg-surface', containerClassName)}
    >
      <table
        data-slot="table"
        data-stack={stackOnMobile || undefined}
        className={cn(
          'w-full caption-bottom border-collapse text-sm',
          stackOnMobile && [
            'max-md:block max-md:[&_tbody]:block max-md:[&_thead]:sr-only',
            'max-md:[&_tr]:block max-md:[&_tr]:px-4 max-md:[&_tr]:py-3',
            'max-md:[&_td]:flex max-md:[&_td]:items-baseline max-md:[&_td]:justify-between max-md:[&_td]:gap-4 max-md:[&_td]:px-0 max-md:[&_td]:py-1 max-md:[&_td]:text-right',
          ],
          className,
        )}
        {...props}
      />
    </div>
  )
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead data-slot="table-header" className={cn('bg-sunken/60', className)} {...props} />
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody data-slot="table-body" className={cn('[&>tr+tr]:border-t [&>tr+tr]:border-line', className)} {...props} />
}

export function TableRow({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'transition-colors duration-120 data-[state=selected]:bg-accent-soft/50',
        interactive && 'cursor-pointer hover:bg-sunken/50',
        className,
      )}
      {...props}
    />
  )
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      className={cn(
        'h-9 whitespace-nowrap border-b border-line px-4 text-left align-middle text-xs font-medium text-fg-muted',
        className,
      )}
      {...props}
    />
  )
}

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  /** Caption shown before the value when the table is stacked on small screens. */
  label?: string
}

export function TableCell({ className, label, children, ...props }: TableCellProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn('px-4 py-3 align-middle text-fg', className)}
      {...props}
    >
      {label && (
        <span aria-hidden="true" className="shrink-0 text-left text-xs font-medium text-fg-muted md:hidden">
          {label}
        </span>
      )}
      {children}
    </td>
  )
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-fg-muted max-md:block">
        {children}
      </td>
    </tr>
  )
}
