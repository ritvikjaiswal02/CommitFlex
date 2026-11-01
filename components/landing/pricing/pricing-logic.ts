/**
 * Pure pricing helpers shared by the landing page and /pricing.
 * Client-safe: imports only the plan catalog.
 */
import {
  PLANS,
  formatPrice,
  isBillingInterval,
  isCurrency,
  isPlanId,
  planRank,
  yearlySavings,
  type BillingInterval,
  type Currency,
  type FeatureKey,
  type LimitKey,
  type PaidPlanId,
  type PlanId,
  type PlanStatus,
} from '@/lib/billing/catalog'

/** Who is looking at the pricing table. */
export type PricingViewer =
  | { signedIn: false }
  | { signedIn: true; plan: PlanId; status: PlanStatus; interval: BillingInterval | null }

/** What the call-to-action under a plan does. */
export type PlanCta =
  | { kind: 'signin'; label: string; next: string }
  | { kind: 'checkout'; label: string; plan: PaidPlanId }
  | { kind: 'link'; label: string; href: string }
  | { kind: 'current'; label: string }

/** Statuses that mean the viewer is paying (or about to stop paying) for a plan. */
const PAYING: readonly PlanStatus[] = ['active', 'past_due', 'cancelling']

/**
 * Decides the button under each plan. The server stays the source of truth for
 * entitlements; this only picks the most useful next step for the viewer.
 */
export function resolvePlanCta(target: PlanId, viewer: PricingViewer, interval: BillingInterval): PlanCta {
  const name = PLANS[target].name

  if (!viewer.signedIn) {
    // Every account starts with the Pro trial, so Free isn't a different
    // promise from Pro here: it's the same GitHub sign-in, stated plainly.
    if (target === 'free') return { kind: 'signin', label: 'Start with GitHub', next: '/dashboard' }
    if (target === 'pro') return { kind: 'signin', label: 'Start 14-day free trial', next: '/dashboard' }
    return { kind: 'signin', label: 'Start with GitHub', next: `/pricing?plan=team&interval=${interval}` }
  }

  const paying = PAYING.includes(viewer.status)

  if (target === 'free') {
    if (viewer.plan === 'free') return { kind: 'current', label: 'Your current plan' }
    if (viewer.status === 'trialing') return { kind: 'current', label: 'Yours when the trial ends' }
    return { kind: 'link', label: 'Manage billing', href: '/billing' }
  }

  if (viewer.plan === target && paying) {
    if (viewer.status === 'cancelling' || viewer.status === 'past_due') {
      return { kind: 'link', label: 'Manage billing', href: '/billing' }
    }
    if (viewer.interval && viewer.interval !== interval) {
      return {
        kind: 'checkout',
        label: interval === 'year' ? `Switch to yearly` : `Switch to monthly`,
        plan: target,
      }
    }
    return { kind: 'current', label: 'Your current plan' }
  }

  if (viewer.status === 'trialing' && target === 'pro') {
    return { kind: 'checkout', label: 'Keep Pro after your trial', plan: 'pro' }
  }

  if (planRank(target) > planRank(viewer.plan)) {
    return { kind: 'checkout', label: `Upgrade to ${name}`, plan: target }
  }

  return { kind: 'checkout', label: `Switch to ${name}`, plan: target }
}

/** Reads `?currency=` and falls back to the detected currency. */
export function resolveCurrency(param: string | string[] | undefined, detected: Currency): Currency {
  const value = Array.isArray(param) ? param[0] : param
  const upper = value?.toUpperCase()
  return isCurrency(upper) ? upper : detected
}

/** Reads `?interval=` (`month` | `year`), defaulting to monthly. */
export function resolveInterval(param: string | string[] | undefined): BillingInterval {
  const value = Array.isArray(param) ? param[0] : param
  return isBillingInterval(value) ? value : 'month'
}

/** Reads `?plan=` to highlight a column the visitor came back for. */
export function resolveFocusPlan(param: string | string[] | undefined): PlanId | null {
  const value = Array.isArray(param) ? param[0] : param
  return isPlanId(value) ? value : null
}

/** Only same-origin relative paths are allowed as a post-sign-in destination. */
export function safeRedirect(value: unknown, fallback = '/dashboard'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login/')) return fallback
  return value
}

export interface PriceDisplay {
  /** '₹499' | '$90' */
  amount: string
  /** 'per month' | 'per year' | 'forever' */
  period: string
  /** 'Save ₹998 a year' on yearly paid plans, otherwise null. */
  note: string | null
}

export function priceDisplay(plan: PlanId, interval: BillingInterval, currency: Currency): PriceDisplay {
  const amount = PLANS[plan].prices[currency][interval]
  if (plan === 'free') return { amount: formatPrice(0, currency), period: 'forever', note: null }
  const savings = interval === 'year' ? yearlySavings(plan, currency) : 0
  return {
    amount: formatPrice(amount, currency),
    period: interval === 'month' ? 'per month' : 'per year',
    note: savings > 0 ? `Save ${formatPrice(savings, currency)} a year` : null,
  }
}

// ---------------------------------------------------------------------------
// Comparison table
// ---------------------------------------------------------------------------

export type CompareCell = boolean | number | string

export interface CompareRow {
  label: string
  hint?: string
  values: Record<PlanId, CompareCell>
}

export interface CompareGroup {
  title: string
  rows: CompareRow[]
}

const limitRow = (key: LimitKey, label: string, hint?: string): CompareRow => ({
  label,
  hint,
  values: {
    free: PLANS.free.limits[key],
    pro: PLANS.pro.limits[key],
    team: PLANS.team.limits[key],
  },
})

const featureRow = (key: FeatureKey, label: string, hint?: string): CompareRow => ({
  label,
  hint,
  values: {
    free: PLANS.free.features.includes(key),
    pro: PLANS.pro.features.includes(key),
    team: PLANS.team.features.includes(key),
  },
})

const everyPlan = (label: string, hint?: string): CompareRow => ({
  label,
  hint,
  values: { free: true, pro: true, team: true },
})

/** Every row comes from the plan catalog, so the table can't drift from what the server enforces. */
export const COMPARE_GROUPS: CompareGroup[] = [
  {
    title: 'Usage',
    rows: [
      limitRow('repos', 'Repos watched'),
      limitRow('generationsPerMonth', 'Drafts per month', 'Each run, regenerate or set of variants counts as one.'),
      limitRow('queuedPosts', 'Posts waiting in the queue'),
      limitRow('voiceProfiles', 'Voice profiles'),
      limitRow('extensionTokens', 'Browser extension connections'),
    ],
  },
  {
    title: 'Autopilot',
    rows: [
      featureRow('autopilot.weekly_digest', 'Weekly digest drafts', 'Every Monday, from repos with real activity that week.'),
      featureRow('autopilot.ship_moments', 'Drafts from merged pull requests and releases'),
      featureRow('autopilot.cadence', 'Posting cadence that fills its own slots'),
      featureRow('publish.auto_approve', 'Post automatically, tell me after'),
    ],
  },
  {
    title: 'Publishing',
    rows: [
      featureRow('publish.linkedin_direct', 'Publish straight to LinkedIn'),
      everyPlan('One-tap handoff to X and LinkedIn'),
      everyPlan('Chrome extension for the LinkedIn and X composers'),
      featureRow('extension.github_button', '“Draft a post” button on GitHub'),
    ],
  },
  {
    title: 'Writing',
    rows: [
      everyPlan('Drafts from a date range, a pull request or a release'),
      featureRow('voice.fingerprint', 'Voice fingerprint from your past posts'),
      featureRow('drafts.variants', 'Alternative versions of a draft'),
    ],
  },
  {
    title: 'Teams and support',
    rows: [
      featureRow('analytics.advanced', 'Insights over 30 and 90 days'),
      limitRow('reviewers', 'Reviewers who approve by email'),
      featureRow('support.priority', 'Priority support'),
    ],
  },
]

/** Accessible text for a comparison cell. */
export function cellLabel(value: CompareCell): string {
  if (value === true) return 'Included'
  if (value === false || value === 0) return 'Not included'
  return String(value)
}
