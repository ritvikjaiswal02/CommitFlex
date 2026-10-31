import { describe, expect, it } from 'vitest'
import {
  COMPARE_GROUPS,
  cellLabel,
  priceDisplay,
  resolveCurrency,
  resolveFocusPlan,
  resolveInterval,
  resolvePlanCta,
  safeRedirect,
  type PricingViewer,
} from '@/components/landing/pricing/pricing-logic'
import { PLANS } from '@/lib/billing/catalog'

const signedOut: PricingViewer = { signedIn: false }
const free: PricingViewer = { signedIn: true, plan: 'free', status: 'free', interval: null }
const trial: PricingViewer = { signedIn: true, plan: 'pro', status: 'trialing', interval: null }
const proMonthly: PricingViewer = { signedIn: true, plan: 'pro', status: 'active', interval: 'month' }
const proCancelling: PricingViewer = { signedIn: true, plan: 'pro', status: 'cancelling', interval: 'month' }
const team: PricingViewer = { signedIn: true, plan: 'team', status: 'active', interval: 'year' }

describe('resolvePlanCta', () => {
  it('sends signed-out visitors through GitHub sign-in', () => {
    expect(resolvePlanCta('free', signedOut, 'month')).toEqual({ kind: 'signin', label: 'Start with GitHub', next: '/dashboard' })
    expect(resolvePlanCta('pro', signedOut, 'month')).toMatchObject({ kind: 'signin', label: 'Start 14-day free trial' })
    expect(resolvePlanCta('team', signedOut, 'year')).toEqual({
      kind: 'signin',
      label: 'Start with GitHub',
      next: '/pricing?plan=team&interval=year',
    })
  })

  it('marks the free plan as current for free users and offers upgrades', () => {
    expect(resolvePlanCta('free', free, 'month')).toEqual({ kind: 'current', label: 'Your current plan' })
    expect(resolvePlanCta('pro', free, 'month')).toEqual({ kind: 'checkout', label: 'Upgrade to Pro', plan: 'pro' })
    expect(resolvePlanCta('team', free, 'month')).toEqual({ kind: 'checkout', label: 'Upgrade to Team', plan: 'team' })
  })

  it('lets trial users keep Pro or move to Team', () => {
    expect(resolvePlanCta('free', trial, 'month')).toMatchObject({ kind: 'current' })
    expect(resolvePlanCta('pro', trial, 'month')).toEqual({ kind: 'checkout', label: 'Keep Pro after your trial', plan: 'pro' })
    expect(resolvePlanCta('team', trial, 'month')).toMatchObject({ kind: 'checkout', plan: 'team' })
  })

  it('shows the current plan and offers a billing-period switch', () => {
    expect(resolvePlanCta('pro', proMonthly, 'month')).toEqual({ kind: 'current', label: 'Your current plan' })
    expect(resolvePlanCta('pro', proMonthly, 'year')).toEqual({ kind: 'checkout', label: 'Switch to yearly', plan: 'pro' })
    expect(resolvePlanCta('free', proMonthly, 'month')).toEqual({ kind: 'link', label: 'Manage billing', href: '/billing' })
  })

  it('sends cancelling subscribers to billing instead of checking out again', () => {
    expect(resolvePlanCta('pro', proCancelling, 'month')).toEqual({ kind: 'link', label: 'Manage billing', href: '/billing' })
  })

  it('offers a switch, not an upgrade, to a lower paid plan', () => {
    expect(resolvePlanCta('pro', team, 'year')).toEqual({ kind: 'checkout', label: 'Switch to Pro', plan: 'pro' })
    expect(resolvePlanCta('team', team, 'year')).toMatchObject({ kind: 'current' })
  })
})

describe('query parsing', () => {
  it('reads currency case-insensitively and falls back to the detected one', () => {
    expect(resolveCurrency('inr', 'USD')).toBe('INR')
    expect(resolveCurrency(['USD', 'INR'], 'INR')).toBe('USD')
    expect(resolveCurrency('EUR', 'INR')).toBe('INR')
    expect(resolveCurrency(undefined, 'USD')).toBe('USD')
  })

  it('defaults the interval to monthly', () => {
    expect(resolveInterval('year')).toBe('year')
    expect(resolveInterval('weekly')).toBe('month')
    expect(resolveInterval(undefined)).toBe('month')
  })

  it('only focuses known plans', () => {
    expect(resolveFocusPlan('team')).toBe('team')
    expect(resolveFocusPlan('enterprise')).toBeNull()
  })
})

describe('safeRedirect', () => {
  it('keeps same-origin paths', () => {
    expect(safeRedirect('/pricing?plan=team')).toBe('/pricing?plan=team')
  })

  it('rejects open redirects and the login page', () => {
    expect(safeRedirect('https://evil.example')).toBe('/dashboard')
    expect(safeRedirect('//evil.example')).toBe('/dashboard')
    expect(safeRedirect('/\\evil.example')).toBe('/dashboard')
    expect(safeRedirect('/login?next=/x')).toBe('/dashboard')
    expect(safeRedirect(null)).toBe('/dashboard')
    expect(safeRedirect('/x'.repeat(300))).toBe('/dashboard')
  })
})

describe('priceDisplay', () => {
  it('shows prices exactly as the catalog defines them', () => {
    expect(priceDisplay('pro', 'month', 'INR')).toMatchObject({ amount: '₹499', period: 'per month', note: null })
    expect(priceDisplay('pro', 'year', 'USD')).toEqual({ amount: '$90', period: 'per year', note: 'Save $18 a year' })
    expect(priceDisplay('team', 'year', 'INR').amount).toBe('₹19,990')
    expect(priceDisplay('free', 'year', 'USD')).toEqual({ amount: '$0', period: 'forever', note: null })
  })
})

describe('COMPARE_GROUPS', () => {
  it('mirrors the plan catalog limits', () => {
    const repos = COMPARE_GROUPS.flatMap((g) => g.rows).find((r) => r.label === 'Repos watched')
    expect(repos?.values).toEqual({ free: PLANS.free.limits.repos, pro: PLANS.pro.limits.repos, team: PLANS.team.limits.repos })
  })

  it('locks Pro features on Free', () => {
    const ship = COMPARE_GROUPS.flatMap((g) => g.rows).find((r) => r.label.startsWith('Drafts from merged'))
    expect(ship?.values).toEqual({ free: false, pro: true, team: true })
  })

  it('has unique row labels', () => {
    const labels = COMPARE_GROUPS.flatMap((g) => g.rows.map((r) => r.label))
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('labels cells for screen readers', () => {
    expect(cellLabel(true)).toBe('Included')
    expect(cellLabel(false)).toBe('Not included')
    expect(cellLabel(0)).toBe('Not included')
    expect(cellLabel(150)).toBe('150')
  })
})
