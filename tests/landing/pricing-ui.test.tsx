import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/components/landing/actions', () => ({ startWithGitHub: vi.fn() }))
vi.mock('@/components/billing/checkout-button', () => ({
  CheckoutButton: ({ plan, interval, currency, children }: { plan: string; interval: string; currency?: string; children?: React.ReactNode }) => (
    <button type="button" data-plan={plan} data-interval={interval} data-currency={currency}>
      {children}
    </button>
  ),
}))

import { PricingTable } from '@/components/landing/pricing/pricing-table'
import { CompareTable } from '@/components/landing/pricing/compare-table'

describe('PricingTable', () => {
  it('shows monthly INR prices and switches to yearly USD', async () => {
    const user = userEvent.setup()
    render(<PricingTable initialCurrency="INR" viewer={{ signedIn: false }} />)

    const pro = screen.getByRole('region', { name: 'Pro' })
    expect(within(pro).getByText('₹499')).toBeInTheDocument()
    expect(within(pro).getByText('Recommended')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Yearly' }))
    await user.click(screen.getByRole('radio', { name: '$ USD' }))
    expect(within(pro).getByText('$90')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Team' })).getByText('$290')).toBeInTheDocument()
  })

  it('offers sign-in to signed-out visitors', () => {
    render(<PricingTable initialCurrency="USD" viewer={{ signedIn: false }} />)
    expect(screen.getByRole('button', { name: /Start 14-day free trial/ })).toBeInTheDocument()
    // Free and Pro both start with the trial; Free just says so plainly.
    expect(screen.getAllByRole('button', { name: /Start with GitHub/ }).length).toBeGreaterThan(0)
    expect(screen.getByText(/Every account starts with 14 days of Pro/)).toBeInTheDocument()
  })

  it('starts checkout for the selected period and currency', async () => {
    const user = userEvent.setup()
    render(
      <PricingTable
        initialCurrency="INR"
        viewer={{ signedIn: true, plan: 'free', status: 'free', interval: null }}
      />,
    )
    expect(within(screen.getByRole('region', { name: 'Free' })).getByRole('button', { name: 'Your current plan' })).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: 'Yearly' }))
    const upgrade = screen.getByRole('button', { name: 'Upgrade to Team' })
    expect(upgrade).toHaveAttribute('data-plan', 'team')
    expect(upgrade).toHaveAttribute('data-interval', 'year')
    expect(upgrade).toHaveAttribute('data-currency', 'INR')
  })
})

describe('CompareTable', () => {
  it('renders every plan column with accessible cells', () => {
    render(<CompareTable />)
    const table = screen.getByRole('table', { name: 'Features and limits on each plan' })
    expect(within(table).getByRole('columnheader', { name: 'Team' })).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: /Repos watched/ })).toBeInTheDocument()
    expect(within(table).getAllByText('Not included').length).toBeGreaterThan(0)
  })
})
