import * as React from 'react'
import { cn } from '@/lib/utils'

export interface FormSectionProps {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  id?: string
}

/**
 * Settings row: a 280px label column and the controls. Stack several with
 * <Separator /> between them; it collapses to one column below `lg`.
 */
export function FormSection({ title, description, children, footer, className, id }: FormSectionProps) {
  const headingId = id ? `${id}-title` : undefined
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-slot="form-section"
      className={cn('grid gap-4 py-8 first:pt-0 last:pb-0 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10', className)}
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-base font-semibold text-fg">
          {title}
        </h2>
        {description && <div className="text-sm text-fg-muted text-pretty">{description}</div>}
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        {children}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">{footer}</div>
        )}
      </div>
    </section>
  )
}
