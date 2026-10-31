import * as React from 'react'
import { cn } from '@/lib/utils'

/** Marketing page container: max 1200px with the standard gutters. */
export function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8', className)} {...props} />
}

export interface SectionProps {
  id: string
  title: React.ReactNode
  lead?: React.ReactNode
  children: React.ReactNode
  /** 'split' puts the heading in a left column (4 of 12); 'stacked' puts it above the content. */
  layout?: 'split' | 'stacked'
  /** Sunken background for alternating rhythm. */
  tone?: 'canvas' | 'sunken'
  className?: string
  contentClassName?: string
}

/**
 * A marketing section with a left-aligned heading. Sections alternate between
 * full-width content and a split heading column so the page has rhythm
 * without decoration.
 */
export function Section({
  id,
  title,
  lead,
  children,
  layout = 'split',
  tone = 'canvas',
  className,
  contentClassName,
}: SectionProps) {
  const headingId = `${id}-title`
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        'scroll-mt-14 border-t border-line py-20 md:py-28',
        tone === 'sunken' ? 'bg-sunken/50' : 'bg-canvas',
        className,
      )}
    >
      <Container
        className={cn(layout === 'split' ? 'grid gap-10 lg:grid-cols-12 lg:gap-8' : 'flex flex-col gap-10 md:gap-12')}
      >
        <header
          className={cn(
            'flex flex-col gap-4',
            layout === 'split' ? 'lg:sticky lg:top-24 lg:col-span-4 lg:self-start' : 'max-w-[44rem]',
          )}
        >
          <h2 id={headingId} className="text-balance text-2xl font-semibold sm:text-3xl">
            {title}
          </h2>
          {lead && <p className="text-pretty text-lg text-fg-muted">{lead}</p>}
        </header>
        <div className={cn(layout === 'split' && 'lg:col-span-7 lg:col-start-6', contentClassName)}>{children}</div>
      </Container>
    </section>
  )
}
