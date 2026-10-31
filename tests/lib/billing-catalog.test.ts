import { describe, it, expect } from 'vitest'
import {
  FEATURE_LABELS,
  LIMIT_LABELS,
  PLANS,
  PLAN_ORDER,
  TRIAL_DAYS,
  describeSubscription,
  formatPrice,
  isPlanErrorBody,
  limitFor,
  limitReachedMessage,
  planDisplayName,
  planHasFeature,
  requiredPlanFor,
  requiredPlanForLimit,
  yearlySavings,
  type FeatureKey,
} from '@/lib/billing/catalog'

describe('plan catalog', () => {
  it('orders plans free → pro → team', () => {
    expect(PLAN_ORDER).toEqual(['free', 'pro', 'team'])
    expect(TRIAL_DAYS).toBe(14)
  })

  it('has the exact prices from the spec, yearly = 10 months', () => {
    expect(PLANS.pro.prices).toEqual({ INR: { month: 499, year: 4990 }, USD: { month: 9, year: 90 } })
    expect(PLANS.team.prices).toEqual({ INR: { month: 1999, year: 19990 }, USD: { month: 29, year: 290 } })
    expect(PLANS.free.prices).toEqual({ INR: { month: 0, year: 0 }, USD: { month: 0, year: 0 } })
    for (const plan of ['pro', 'team'] as const) {
      for (const cur of ['INR', 'USD'] as const) {
        expect(PLANS[plan].prices[cur].year).toBe(PLANS[plan].prices[cur].month * 10)
      }
    }
  })

  it('has the exact limits from the spec', () => {
    expect(PLANS.free.limits).toEqual({ repos: 1, generationsPerMonth: 10, voiceProfiles: 1, queuedPosts: 3, extensionTokens: 2, reviewers: 0 })
    expect(PLANS.pro.limits).toEqual({ repos: 10, generationsPerMonth: 150, voiceProfiles: 5, queuedPosts: 60, extensionTokens: 5, reviewers: 0 })
    expect(PLANS.team.limits).toEqual({ repos: 40, generationsPerMonth: 600, voiceProfiles: 20, queuedPosts: 250, extensionTokens: 20, reviewers: 5 })
  })

  it('maps features to plans per the spec table', () => {
    const table: Record<FeatureKey, [boolean, boolean, boolean]> = {
      'autopilot.weekly_digest': [true, true, true],
      'autopilot.ship_moments': [false, true, true],
      'autopilot.cadence': [false, true, true],
      'publish.linkedin_direct': [false, true, true],
      'publish.auto_approve': [false, true, true],
      'drafts.variants': [false, true, true],
      'analytics.advanced': [false, true, true],
      'voice.fingerprint': [true, true, true],
      'team.reviewers': [false, false, true],
      'extension.github_button': [true, true, true],
      'support.priority': [false, false, true],
    }
    for (const [key, [free, pro, team]] of Object.entries(table) as [FeatureKey, [boolean, boolean, boolean]][]) {
      expect(planHasFeature('free', key), `free ${key}`).toBe(free)
      expect(planHasFeature('pro', key), `pro ${key}`).toBe(pro)
      expect(planHasFeature('team', key), `team ${key}`).toBe(team)
    }
    expect(Object.keys(FEATURE_LABELS).sort()).toEqual(Object.keys(table).sort())
  })

  it('has labels for every limit', () => {
    expect(LIMIT_LABELS.generationsPerMonth).toEqual({ label: 'Drafts this month', unit: 'drafts' })
    expect(Object.keys(LIMIT_LABELS)).toHaveLength(6)
  })

  it('finds the cheapest plan for a feature', () => {
    expect(requiredPlanFor('autopilot.weekly_digest')).toBe('free')
    expect(requiredPlanFor('autopilot.ship_moments')).toBe('pro')
    expect(requiredPlanFor('team.reviewers')).toBe('team')
  })

  it('finds the cheapest paid plan that fits a limit', () => {
    expect(requiredPlanForLimit('generationsPerMonth', 11)).toBe('pro')
    expect(requiredPlanForLimit('generationsPerMonth', 151)).toBe('team')
    expect(requiredPlanForLimit('reviewers', 1)).toBe('team')
    expect(requiredPlanForLimit('repos', 1000)).toBe('team')
    expect(limitFor('pro', 'repos')).toBe(10)
  })

  it('formats prices without decimals', () => {
    expect(formatPrice(4990, 'INR')).toBe('₹4,990')
    expect(formatPrice(19990, 'INR')).toBe('₹19,990')
    expect(formatPrice(90, 'USD')).toBe('$90')
    expect(formatPrice(9, 'USD')).toBe('$9')
  })

  it('computes yearly savings as 12 × month − year', () => {
    expect(yearlySavings('pro', 'INR')).toBe(998)
    expect(yearlySavings('pro', 'USD')).toBe(18)
    expect(yearlySavings('team', 'USD')).toBe(58)
  })

  it('describes subscriptions and trial names', () => {
    expect(describeSubscription('pro', 'month')).toBe('Pro, monthly')
    expect(describeSubscription('team', 'year')).toBe('Team, yearly')
    expect(planDisplayName('pro', 'trialing')).toBe('Pro trial')
    expect(planDisplayName('free')).toBe('Free')
  })

  it('writes the spec limit copy', () => {
    expect(limitReachedMessage('generationsPerMonth', 10, 10, 'pro')).toBe(
      "You've used 10 of 10 drafts this month. Pro includes 150 a month.",
    )
    expect(limitReachedMessage('reviewers', 0, 0, 'team')).toBe("Reviewers aren't included in your plan. Team includes 5.")
  })

  it('recognises 402 bodies', () => {
    expect(
      isPlanErrorBody({ error: 'x', code: 'feature_locked', feature: 'drafts.variants', requiredPlan: 'pro', currentPlan: 'free' }),
    ).toBe(true)
    expect(
      isPlanErrorBody({ error: 'x', code: 'limit_reached', limit: 'repos', used: 1, max: 1, requiredPlan: 'pro', currentPlan: 'free' }),
    ).toBe(true)
    expect(isPlanErrorBody({ error: 'x', code: 'feature_locked', feature: 'nope', requiredPlan: 'pro', currentPlan: 'free' })).toBe(false)
    expect(isPlanErrorBody({ error: 'x', code: 'limit_reached', limit: 'repos', requiredPlan: 'pro', currentPlan: 'free' })).toBe(false)
    expect(isPlanErrorBody({ error: 'x', code: 'unauthorized' })).toBe(false)
    expect(isPlanErrorBody(null)).toBe(false)
  })
})
