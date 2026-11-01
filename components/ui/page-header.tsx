import * as React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface PageHeaderProps {
  title: string
  /** One line that says what this page is for. */
  description?: React.ReactNode
  /** Buttons on the right (stacked under the title below `sm`). One primary action per page. */
  actions?: React.ReactNode
  breadcrumb?: BreadcrumbItem[]
  /** Small row under the description: badges, a status, a timestamp. */
  meta?: React.ReactNode
  className?: string
}

/**
 * Page title block for app pages. It carries its own bottom margin
 * (`mb-6 lg:mb-8`); pass `className="mb-0"` when the parent already spaces it.
 */
export function PageHeader({ title, description, actions, breadcrumb, meta, className }: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn('mb-6 flex flex-col gap-3 lg:mb-8', className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-fg-muted">
            {breadcrumb.map((item, index) => {
              const last = index === breadcrumb.length - 1
              return (
                <li key={`${item.label}-${index}`} className="flex items-center gap-1">
                  {item.href && !last ? (
                    <Link
                      href={item.href}
                      className="rounded-sm transition-colors duration-120 hover:text-fg focus-ring"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span aria-current={last ? 'page' : undefined} className={cn(last && 'text-fg')}>
                      {item.label}
                    </span>
                  )}
                  {!last && <ChevronRight className="size-3.5 text-fg-subtle" strokeWidth={1.75} aria-hidden="true" />}
                </li>
              )
            })}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold text-fg text-balance">{title}</h1>
          {description && <p className="max-w-prose text-base text-fg-muted">{description}</p>}
          {meta && <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
