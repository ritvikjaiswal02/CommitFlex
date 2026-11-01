/**
 * Plan catalog. Client-safe: no server imports, no env access.
 *
 * Client components import plan data from here. Server code imports
 * `@/lib/plans`, which re-exports everything below and adds entitlements.
 * Values follow docs/PRODUCT_SPEC.md §7 exactly.
 */

export type PlanId = 'free' | 'pro' | 'team'
export type PaidPlanId = 'pro' | 'team'
export type BillingInterval = 'month' | 'year'
export type Currency = 'INR' | 'USD'

export type FeatureKey =
  | 'autopilot.weekly_digest'
  | 'autopilot.ship_moments'
  | 'autopilot.cadence'
  | 'publish.linkedin_direct'
  | 'publish.auto_approve'
  | 'drafts.variants'
  | 'analytics.advanced'
  | 'voice.fingerprint'
  | 'team.reviewers'
  | 'extension.github_button'
  | 'support.priority'

export type LimitKey =
  | 'repos'
  | 'generationsPerMonth'
  | 'voiceProfiles'
  | 'queuedPosts'
  | 'extensionTokens'
  | 'reviewers'

export type PlanStatus = 'free' | 'trialing' | 'active' | 'past_due' | 'cancelling'

export interface PlanDefinition {
  id: PlanId
  /** 'Free' | 'Pro' | 'Team' */
  name: string
  tagline: string
  /** Major units (rupees, dollars). Yearly equals ten months. */
  prices: Record<Currency, Record<BillingInterval, number>>
  features: FeatureKey[]
  limits: Record<LimitKey, number>
  /** Plain-language bullets for pricing cards. */
  highlights: string[]
}

export const PLAN_ORDER: readonly PlanId[] = ['free', 'pro', 'team'] as const
export const PAID_PLANS: readonly PaidPlanId[] = ['pro', 'team'] as const
export const CURRENCIES: readonly Currency[] = ['INR', 'USD'] as const
export const BILLING_INTERVALS: readonly BillingInterval[] = ['month', 'year'] as const

export const TRIAL_DAYS = 14

const PRO_FEATURES: FeatureKey[] = [
  'autopilot.weekly_digest',
  'autopilot.ship_moments',
  'autopilot.cadence',
  'publish.linkedin_direct',
  'publish.auto_approve',
  'drafts.variants',
  'analytics.advanced',
  'voice.fingerprint',
  'extension.github_button',
]

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Try it on one repo.',
    prices: { INR: { month: 0, year: 0 }, USD: { month: 0, year: 0 } },
    features: ['autopilot.weekly_digest', 'voice.fingerprint', 'extension.github_button'],
    limits: {
      repos: 1,
      generationsPerMonth: 10,
      voiceProfiles: 1,
      queuedPosts: 3,
      extensionTokens: 2,
      reviewers: 0,
    },
    highlights: [
      '1 repo watched',
      '10 drafts a month',
      'Weekly digest drafts from your commits',
      'One-tap handoff to LinkedIn and X',
      'Chrome extension for LinkedIn, X and GitHub',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'Build in public on autopilot.',
    prices: { INR: { month: 499, year: 4990 }, USD: { month: 9, year: 90 } },
    features: PRO_FEATURES,
    limits: {
      repos: 10,
      generationsPerMonth: 150,
      voiceProfiles: 5,
      queuedPosts: 60,
      extensionTokens: 5,
      reviewers: 0,
    },
    highlights: [
      '10 repos watched',
      '150 drafts a month',
      'Drafts from merged PRs and releases',
      'A posting cadence that fills itself',
      'Publish straight to LinkedIn',
      'Auto-approve and variants',
      'Streaks and ship-to-post insights over 90 days',
    ],
  },
  team: {
    id: 'team',
    name: 'Team',
    tagline: 'Review before anything goes out.',
    prices: { INR: { month: 1999, year: 19990 }, USD: { month: 29, year: 290 } },
    features: [...PRO_FEATURES, 'team.reviewers', 'support.priority'],
    limits: {
      repos: 40,
      generationsPerMonth: 600,
      voiceProfiles: 20,
      queuedPosts: 250,
      extensionTokens: 20,
      reviewers: 5,
    },
    highlights: [
      '40 repos watched',
      '600 drafts a month',
      'Everything in Pro',
      'Up to 5 reviewers approve drafts by email',
      '20 voice profiles for the whole team',
      'Priority support',
    ],
  },
}

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  'autopilot.weekly_digest': 'Weekly digest drafts',
  'autopilot.ship_moments': 'Drafts from merged PRs and releases',
  'autopilot.cadence': 'Fixed posting cadence',
  'publish.linkedin_direct': 'Publish directly to LinkedIn',
  'publish.auto_approve': 'Post automatically without review',
  'drafts.variants': 'Alternative versions of a draft',
  'analytics.advanced': 'Streaks and ship-to-post insights over 90 days',
  'voice.fingerprint': 'Voice fingerprint from your past posts',
  'team.reviewers': 'Reviewers who approve drafts by email',
  'extension.github_button': '"Draft a post" button on GitHub',
  'support.priority': 'Priority support',
}

export const LIMIT_LABELS: Record<LimitKey, { label: string; unit: string }> = {
  repos: { label: 'Repos watched', unit: 'repos' },
  generationsPerMonth: { label: 'Drafts this month', unit: 'drafts' },
  voiceProfiles: { label: 'Voice profiles', unit: 'profiles' },
  queuedPosts: { label: 'Posts in queue', unit: 'posts' },
  extensionTokens: { label: 'Extension connections', unit: 'connections' },
  reviewers: { label: 'Reviewers', unit: 'reviewers' },
}

export const LIMIT_KEYS: readonly LimitKey[] = Object.keys(LIMIT_LABELS) as LimitKey[]
export const FEATURE_KEYS: readonly FeatureKey[] = Object.keys(FEATURE_LABELS) as FeatureKey[]

export function isPlanId(value: unknown): value is PlanId {
  return value === 'free' || value === 'pro' || value === 'team'
}

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return value === 'pro' || value === 'team'
}

export function isCurrency(value: unknown): value is Currency {
  return value === 'INR' || value === 'USD'
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'month' || value === 'year'
}

/** 0 for free, 1 for pro, 2 for team. */
export function planRank(plan: PlanId): number {
  return PLAN_ORDER.indexOf(plan)
}

export function planHasFeature(plan: PlanId, key: FeatureKey): boolean {
  return PLANS[plan].features.includes(key)
}

export function limitFor(plan: PlanId, key: LimitKey): number {
  return PLANS[plan].limits[key]
}

/** Cheapest plan that includes the feature. */
export function requiredPlanFor(key: FeatureKey): PaidPlanId | 'free' {
  for (const plan of PLAN_ORDER) {
    if (planHasFeature(plan, key)) return plan
  }
  return 'team'
}

/**
 * Cheapest paid plan that allows `needed` of the limit. Falls back to 'team'
 * when even Team can't fit it, so the upgrade prompt always has a target.
 */
export function requiredPlanForLimit(key: LimitKey, needed: number): PaidPlanId {
  for (const plan of PAID_PLANS) {
    if (limitFor(plan, key) >= needed) return plan
  }
  return 'team'
}

/** The plan to suggest when someone on `current` hits a wall. */
export function nextPlan(current: PlanId): PaidPlanId {
  return current === 'free' ? 'pro' : 'team'
}

export function priceFor(plan: PlanId, interval: BillingInterval, currency: Currency): number {
  return PLANS[plan].prices[currency][interval]
}

/** '₹4,990' | '$90' (no decimals). */
export function formatPrice(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/** How much a year costs less than twelve months (major units). */
export function yearlySavings(plan: PaidPlanId, currency: Currency): number {
  const prices = PLANS[plan].prices[currency]
  return prices.month * 12 - prices.year
}

/** 'Pro, monthly' | 'Team, yearly' — used for checkout descriptions. */
export function describeSubscription(plan: PaidPlanId, interval: BillingInterval): string {
  return `${PLANS[plan].name}, ${interval === 'month' ? 'monthly' : 'yearly'}`
}

/** Human label for a plan + status, e.g. 'Pro trial'. */
export function planDisplayName(plan: PlanId, status?: PlanStatus): string {
  if (status === 'trialing') return `${PLANS[plan].name} trial`
  return PLANS[plan].name
}

// ---------------------------------------------------------------------------
// 402 bodies (server and client agree on this shape)
// ---------------------------------------------------------------------------

export type PlanErrorBody =
  | {
      error: string
      code: 'feature_locked'
      feature: FeatureKey
      requiredPlan: PaidPlanId
      currentPlan: PlanId
    }
  | {
      error: string
      code: 'limit_reached'
      limit: LimitKey
      used: number
      max: number
      requiredPlan: PaidPlanId
      currentPlan: PlanId
    }

export function isPlanErrorBody(body: unknown): body is PlanErrorBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  if (typeof b.error !== 'string' || !isPaidPlanId(b.requiredPlan) || !isPlanId(b.currentPlan)) return false
  if (b.code === 'feature_locked') {
    return typeof b.feature === 'string' && (FEATURE_KEYS as readonly string[]).includes(b.feature)
  }
  if (b.code === 'limit_reached') {
    return (
      typeof b.limit === 'string' &&
      (LIMIT_KEYS as readonly string[]).includes(b.limit) &&
      typeof b.used === 'number' &&
      typeof b.max === 'number'
    )
  }
  return false
}

/** Copy for a locked feature: 'Available on Pro: Drafts from merged PRs and releases.' */
export function featureLockedMessage(feature: FeatureKey, requiredPlan: PaidPlanId): string {
  return `Available on ${PLANS[requiredPlan].name}: ${FEATURE_LABELS[feature]}.`
}

/**
 * Copy for a reached limit, e.g.
 * "You've used 10 of 10 drafts this month. Pro includes 150 a month."
 */
export function limitReachedMessage(limit: LimitKey, used: number, max: number, requiredPlan: PaidPlanId): string {
  const target = PLANS[requiredPlan]
  const targetMax = target.limits[limit]
  const { unit, label } = LIMIT_LABELS[limit]
  if (limit === 'generationsPerMonth') {
    return `You've used ${used} of ${max} drafts this month. ${target.name} includes ${targetMax} a month.`
  }
  if (max === 0) {
    return `${label} aren't included in your plan. ${target.name} includes ${targetMax}.`
  }
  return `You've used ${Math.min(used, max)} of ${max} ${unit} on your plan. ${target.name} includes ${targetMax}.`
}
