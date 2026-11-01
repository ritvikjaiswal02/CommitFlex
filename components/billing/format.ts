/**
 * Billing date and money formatting. Client-safe and deterministic (UTC), so
 * server and client renders agree and match Razorpay's billing dates.
 */
import { formatPrice, type Currency } from '@/lib/billing/catalog'

const DAY_MS = 24 * 60 * 60 * 1000

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** '12 Dec 2026' */
export function formatBillingDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : DATE.format(date)
}

/** '12 Dec' */
export function formatShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : SHORT_DATE.format(date)
}

/** Whole days from now until `iso`, never negative. */
export function daysUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.ceil((t - now) / DAY_MS))
}

/** 'today' | 'tomorrow' | 'in 9 days' */
export function relativeDays(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

/** Invoice amounts can carry paise or cents; plan prices never do. */
export function formatAmount(amount: number, currency: Currency): string {
  if (Number.isInteger(amount)) return formatPrice(amount, currency)
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** First day of next month for a 'YYYY-MM' usage period: '1 Dec'. */
export function usageResetDate(period: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(period)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) // 1-12; Date.UTC month is 0-based, so this is next month
  return SHORT_DATE.format(new Date(Date.UTC(year, month, 1)))
}
