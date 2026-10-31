/**
 * Billing components (PlanBadge, UsageMeter, PaywallGate, UpgradeProvider,
 * UpgradeDialog) and their pure helpers. Written with createElement so the
 * file matches the tests/api/billing*.test.ts ownership glob.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement as h, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/billing' }))

import { PlanBadge } from '@/components/billing/plan-badge'
import { UsageMeter, usageText, usageTone } from '@/components/billing/usage-meter'
import { PaywallGate } from '@/components/billing/paywall-gate'
import { UpgradeProvider, useUpgrade } from '@/components/billing/upgrade-provider'
import { targetPlanFor, upgradeMessage } from '@/components/billing/upgrade-dialog'
import { daysUntil, formatAmount, formatBillingDate, relativeDays, usageResetDate } from '@/components/billing/format'
import { invalidateBillingStatus } from '@/components/billing/use-billing-status'

const statusBody = {
  plan: { id: 'free', name: 'Free', status: 'free', interval: null, currency: null, currentPeriodEnd: null, trialEndsAt: null, cancelAtPeriodEnd: false },
  usage: { period: '2026-11', items: {} },
  suggestedCurrency: 'INR',
  configured: true,
  checkout: { pro: { month: ['INR', 'USD'], year: ['INR', 'USD'] }, team: { month: ['INR', 'USD'], year: ['INR', 'USD'] } },
}

beforeEach(() => {
  vi.clearAllMocks()
  invalidateBillingStatus()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(statusBody), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PlanBadge', () => {
  it('labels plans and trials', () => {
    render(h('div', null, h(PlanBadge, { plan: 'free' }), h(PlanBadge, { plan: 'pro', status: 'trialing' }), h(PlanBadge, { plan: 'team' })))
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.getByText('Pro trial')).toBeInTheDocument()
    expect(screen.getByText('Team').getAttribute('data-plan')).toBe('team')
  })
})

describe('UsageMeter', () => {
  it('shows "7 of 10 drafts" with an accessible bar', () => {
    render(h(UsageMeter, { label: 'Drafts this month', used: 7, max: 10, unit: 'drafts' }))
    expect(screen.getByText('7 of 10 drafts')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '7')
    expect(bar).toHaveAttribute('aria-valuemax', '10')
  })

  it('turns warning at 80% and danger at 100%', () => {
    expect(usageTone(7, 10)).toBe('accent')
    expect(usageTone(8, 10)).toBe('warning')
    expect(usageTone(10, 10)).toBe('danger')
    expect(usageTone(12, 10)).toBe('danger')
    expect(usageText(1500, 2000, 'drafts')).toBe('1,500 of 2,000 drafts')
  })

  it('reads "Not on your plan" for a zero limit and offers plans when asked', () => {
    render(h(UsageMeter, { label: 'Reviewers', used: 0, max: 0, showUpgrade: true }))
    expect(screen.getByText('Not on your plan')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByRole('button', { name: 'See plans that include it' })).toBeInTheDocument()
  })

  it('only shows the upgrade link near the limit', () => {
    const { rerender } = render(h(UsageMeter, { label: 'Drafts', used: 2, max: 10, showUpgrade: true }))
    expect(screen.queryByRole('button')).toBeNull()
    rerender(h(UsageMeter, { label: 'Drafts', used: 10, max: 10, showUpgrade: true }))
    expect(screen.getByRole('button', { name: 'Upgrade for more' })).toBeInTheDocument()
  })
})

describe('PaywallGate', () => {
  it('renders children when the plan has the feature', () => {
    render(h(PaywallGate, { plan: 'pro', feature: 'drafts.variants', children: h('p', null, 'Variants panel') }))
    expect(screen.getByText('Variants panel')).toBeInTheDocument()
  })

  it('replaces locked content with an upgrade panel', () => {
    render(h(PaywallGate, { plan: 'free', feature: 'drafts.variants', children: h('p', null, 'Variants panel') }))
    expect(screen.queryByText('Variants panel')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Alternative versions of a draft' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upgrade to Pro' })).toBeInTheDocument()
  })

  it('asks for Team when only Team has the feature', () => {
    render(h(PaywallGate, { plan: 'pro', feature: 'team.reviewers', title: 'Reviewers', children: h('p', null, 'x') }))
    expect(screen.getByRole('button', { name: 'Upgrade to Team' })).toBeInTheDocument()
  })

  it('keeps an inert preview in overlay mode', () => {
    render(h(PaywallGate, { plan: 'free', feature: 'analytics.advanced', mode: 'overlay', children: h('p', null, 'Chart preview') }))
    const preview = screen.getByText('Chart preview').parentElement!
    expect(preview).toHaveAttribute('aria-hidden', 'true')
    expect(preview).toHaveAttribute('inert')
  })

  it('opens the upgrade dialog inside a provider', async () => {
    render(h(UpgradeProvider, { children: h(PaywallGate, { plan: 'free', feature: 'autopilot.ship_moments', children: h('p', null, 'x') }) }))
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Available on Pro: Drafts from merged PRs and releases.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('₹499')).toBeInTheDocument())
  })
})

describe('useUpgrade', () => {
  function Probe({ onReady }: { onReady: (api: ReturnType<typeof useUpgrade>) => void }): ReactNode {
    onReady(useUpgrade())
    return null
  }

  it('is safe outside a provider', async () => {
    let api: ReturnType<typeof useUpgrade> | null = null
    render(h(Probe, { onReady: (a) => (api = a) }))
    const res = new Response(JSON.stringify({ error: 'x', code: 'limit_reached' }), { status: 402 })
    expect(await api!.handlePlanError(res)).toBe(false)
  })

  it('opens the dialog for a 402 limit body and leaves the response readable', async () => {
    let api: ReturnType<typeof useUpgrade> | null = null
    render(h(UpgradeProvider, { children: h(Probe, { onReady: (a) => (api = a) }) }))
    const res = new Response(
      JSON.stringify({ error: 'limit', code: 'limit_reached', limit: 'generationsPerMonth', used: 10, max: 10, requiredPlan: 'pro', currentPlan: 'free' }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    )
    let handled = false
    await act(async () => {
      handled = await api!.handlePlanError(res)
    })
    expect(handled).toBe(true)
    expect(await screen.findByText("You've used 10 of 10 drafts this month. Pro includes 150 a month.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument()
    expect((await res.json()).code).toBe('limit_reached')
  })

  it('ignores non-402 responses and unrelated 402 bodies', async () => {
    let api: ReturnType<typeof useUpgrade> | null = null
    render(h(UpgradeProvider, { children: h(Probe, { onReady: (a) => (api = a) }) }))
    expect(await api!.handlePlanError(new Response('{}', { status: 400 }))).toBe(false)
    expect(await api!.handlePlanError(new Response('{"error":"pay"}', { status: 402 }))).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('upgrade copy helpers', () => {
  it('targets the required plan, else the next plan up', () => {
    expect(targetPlanFor(undefined, 'team', 'free')).toBe('team')
    expect(targetPlanFor({ code: 'feature_locked', feature: 'team.reviewers' }, undefined, 'free')).toBe('team')
    expect(targetPlanFor({ code: 'manual' }, undefined, 'pro')).toBe('team')
    expect(targetPlanFor(undefined, undefined, undefined)).toBe('pro')
  })

  it('writes the limit and feature messages', () => {
    expect(upgradeMessage({ code: 'limit_reached', limit: 'repos', used: 1, max: 1 }, 'pro')).toBe(
      "You've used 1 of 1 repos on your plan. Pro includes 10.",
    )
    expect(upgradeMessage({ code: 'feature_locked', feature: 'publish.linkedin_direct' }, 'pro')).toBe(
      'Available on Pro: Publish directly to LinkedIn.',
    )
    expect(upgradeMessage({ code: 'manual' }, 'team')).toBe('Review before anything goes out.')
  })
})

describe('billing formatting', () => {
  it('formats dates in UTC and relative days', () => {
    expect(formatBillingDate('2026-12-12T03:00:00.000Z')).toBe('12 Dec 2026')
    expect(formatBillingDate(null)).toBeNull()
    expect(daysUntil(new Date(Date.now() + 2.5 * 86_400_000).toISOString())).toBe(3)
    expect(daysUntil(new Date(Date.now() - 86_400_000).toISOString())).toBe(0)
    expect(relativeDays(0)).toBe('today')
    expect(relativeDays(1)).toBe('tomorrow')
    expect(relativeDays(9)).toBe('in 9 days')
  })

  it('formats invoice amounts and the usage reset date', () => {
    expect(formatAmount(499, 'INR')).toBe('₹499')
    expect(formatAmount(9.5, 'USD')).toBe('$9.50')
    expect(usageResetDate('2026-11')).toBe('1 Dec')
    expect(usageResetDate('2026-12')).toBe('1 Jan')
    expect(usageResetDate('bad')).toBeNull()
  })
})
