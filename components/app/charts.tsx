import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Hand-built charts (no chart library, per BUILD_CONTRACTS §2). Plain HTML
 * bars so they stay crisp at any width; every chart also renders its numbers
 * as a visually hidden table for screen readers.
 */

export interface StackSeries {
  key: string
  label: string
  /** Tailwind background class for the bar segment and legend swatch. */
  className: string
}

export interface StackDatum {
  /** Axis label, e.g. "3 Nov". */
  label: string
  /** Long label for tooltips and the table, e.g. "Tue, 3 Nov". */
  longLabel: string
  values: Record<string, number>
}

/** A rounded-up axis maximum with 2–4 even steps. */
export function niceMax(value: number): number {
  if (value <= 2) return 2
  if (value <= 4) return 4
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) {
    const max = Math.ceil(value / (step * magnitude)) * step * magnitude
    if (max / (step * magnitude) <= 4) return max
  }
  return Math.ceil(value)
}

/** Which x labels to print so they never collide: every label up to 10 bars, then evenly thinned. */
export function labelEvery(count: number): number {
  if (count <= 10) return 1
  if (count <= 31) return Math.ceil(count / 6)
  return Math.ceil(count / 8)
}

export function StackedBarChart({
  data,
  series,
  title,
  height = 200,
  className,
}: {
  data: StackDatum[]
  series: StackSeries[]
  title: string
  height?: number
  className?: string
}) {
  const totals = data.map((d) => series.reduce((sum, s) => sum + (d.values[s.key] ?? 0), 0))
  const max = niceMax(Math.max(0, ...totals))
  const ticks = [max, max / 2, 0]
  const every = labelEvery(data.length)

  return (
    <figure className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-4" aria-hidden="true">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
            <span className={cn('size-2.5 rounded-sm', s.className)} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2" aria-hidden="true">
        <div className="flex flex-col justify-between text-right text-xs tabular-nums text-fg-subtle" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </span>
          ))}
        </div>
        <div className="relative" style={{ height }}>
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {ticks.map((t) => (
              <span key={t} className={cn('h-px w-full', t === 0 ? 'bg-line-strong' : 'bg-line')} />
            ))}
          </div>
          <div className="absolute inset-0 flex items-end gap-[2px] sm:gap-1">
            {data.map((d, i) => {
              const total = totals[i]
              const tooltip = `${d.longLabel}: ${series.map((s) => `${s.label} ${d.values[s.key] ?? 0}`).join(', ')}`
              return (
                <div key={`${d.label}-${i}`} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={tooltip}>
                  <div className="absolute inset-x-0 bottom-0 top-0 rounded-sm transition-colors duration-120 group-hover:bg-sunken/70" />
                  <div
                    className="relative flex w-full flex-col-reverse overflow-hidden rounded-t-sm"
                    style={{ height: `${max > 0 ? (total / max) * 100 : 0}%` }}
                  >
                    {series.map((s) => {
                      const v = d.values[s.key] ?? 0
                      if (v === 0 || total === 0) return null
                      return <div key={s.key} className={s.className} style={{ height: `${(v / total) * 100}%` }} />
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div />
        <div className="mt-1.5 flex gap-[2px] sm:gap-1">
          {data.map((d, i) => (
            <span key={`${d.label}-${i}`} className="min-w-0 flex-1 truncate text-center text-xs tabular-nums text-fg-subtle">
              {i % every === 0 ? d.label : ''}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="sr-only">{title}</figcaption>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={`${d.label}-${i}`}>
              <th scope="row">{d.longLabel}</th>
              {series.map((s) => (
                <td key={s.key}>{d.values[s.key] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

export interface BarRow {
  key: string
  label: React.ReactNode
  value: number
  /** Text for the value column; defaults to the number. */
  display?: string
}

/** Horizontal bars for a ranked breakdown. */
export function BarList({
  rows,
  title,
  barClassName = 'bg-accent',
  empty,
}: {
  rows: BarRow[]
  title: string
  barClassName?: string
  empty?: React.ReactNode
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (rows.length === 0) return <>{empty ?? null}</>
  return (
    <ul aria-label={title} className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-fg">{row.label}</span>
            <span className="shrink-0 tabular-nums text-fg-muted">{row.display ?? row.value.toLocaleString('en-US')}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
            <div className={cn('h-full rounded-full', barClassName)} style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
