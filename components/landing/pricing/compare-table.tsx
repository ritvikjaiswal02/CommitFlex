'use client'

import * as React from 'react'
import { Check, Minus } from 'lucide-react'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { PLANS, PLAN_ORDER, type PlanId } from '@/lib/billing/catalog'
import { cn } from '@/lib/utils'
import { COMPARE_GROUPS, cellLabel, type CompareCell } from './pricing-logic'

/**
 * Full feature comparison. On wide screens it is a four-column table; below
 * `md` one plan is shown at a time (picked with a segmented control), so the
 * table never scrolls sideways.
 */
export function CompareTable({ className }: { className?: string }) {
  const [mobilePlan, setMobilePlan] = React.useState<PlanId>('pro')

  const planCell = (plan: PlanId) => (plan === mobilePlan ? 'table-cell' : 'hidden md:table-cell')

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="md:hidden">
        <SegmentedControl<PlanId>
          aria-label="Plan to compare"
          value={mobilePlan}
          onValueChange={setMobilePlan}
          options={PLAN_ORDER.map((plan) => ({ value: plan, label: PLANS[plan].name }))}
          className="w-full [&>button]:flex-1"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Features and limits on each plan</caption>
          <thead>
            <tr className="border-b border-line bg-sunken/60">
              <th scope="col" className="px-4 py-3 text-sm font-medium text-fg-muted sm:px-5">
                Feature
              </th>
              {PLAN_ORDER.map((plan) => (
                <th
                  key={plan}
                  scope="col"
                  className={cn('w-28 px-3 py-3 text-center text-sm font-semibold text-fg sm:w-32 md:w-36', planCell(plan))}
                >
                  {PLANS[plan].name}
                </th>
              ))}
            </tr>
          </thead>
          {COMPARE_GROUPS.map((group) => (
            <tbody key={group.title} className="border-b border-line last:border-b-0">
              <tr>
                <th
                  scope="colgroup"
                  colSpan={PLAN_ORDER.length + 1}
                  className="px-4 pb-2 pt-5 text-sm font-semibold text-fg sm:px-5"
                >
                  {group.title}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.label} className="border-t border-line first:border-t-0">
                  <th scope="row" className="px-4 py-3 align-top text-sm font-normal text-fg sm:px-5">
                    {row.label}
                    {row.hint && <span className="mt-0.5 block text-xs text-fg-subtle">{row.hint}</span>}
                  </th>
                  {PLAN_ORDER.map((plan) => (
                    <td key={plan} className={cn('px-3 py-3 text-center align-top', planCell(plan))}>
                      <Cell value={row.values[plan]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  )
}

function Cell({ value }: { value: CompareCell }) {
  if (value === true) {
    return (
      <span className="inline-flex justify-center">
        <Check className="size-4 text-accent" strokeWidth={2} aria-hidden="true" />
        <span className="sr-only">{cellLabel(value)}</span>
      </span>
    )
  }
  if (value === false || value === 0) {
    return (
      <span className="inline-flex justify-center">
        <Minus className="size-4 text-fg-subtle" strokeWidth={1.75} aria-hidden="true" />
        <span className="sr-only">{cellLabel(value)}</span>
      </span>
    )
  }
  return <span className="text-sm font-medium tabular-nums text-fg">{cellLabel(value)}</span>
}
