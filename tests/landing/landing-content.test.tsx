import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/components/landing/actions', () => ({ startWithGitHub: vi.fn() }))
vi.mock('@/components/billing/checkout-button', () => ({
  CheckoutButton: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button>,
}))
vi.mock('@/components/billing/upgrade-provider', () => ({
  UpgradeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { LandingContent } from '@/components/landing-content'

describe('LandingContent', () => {
  it('renders the hero, every section and one h1', () => {
    render(<LandingContent currency="INR" viewer={{ signedIn: false }} />)

    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent('You shipped it. CommitFlex writes the post.')

    for (const id of ['how-it-works', 'ship-moments', 'voice', 'publishing', 'trust', 'pricing', 'faq']) {
      expect(document.getElementById(id)).not.toBeNull()
    }
    // The before/after list was folded into How it works.
    expect(document.getElementById('what-changes')).toBeNull()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Start with GitHub/ }).length).toBeGreaterThan(0)
  })

  it('shows INR prices for Indian visitors', () => {
    render(<LandingContent currency="INR" viewer={{ signedIn: false }} />)
    const pro = screen.getByRole('region', { name: 'Pro' })
    expect(within(pro).getByText('₹499')).toBeInTheDocument()
  })

  it('switches the tone example', async () => {
    const user = userEvent.setup()
    render(<LandingContent viewer={{ signedIn: false }} />)
    await user.click(screen.getByRole('radio', { name: /Casual/ }))
    expect(screen.getByRole('article', { name: /casual tone/ })).toHaveTextContent('Small one:')
  })
})
