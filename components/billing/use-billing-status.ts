'use client'

import * as React from 'react'
import type { Currency } from '@/lib/billing/catalog'
import type { BillingStatusResponse } from './types'

/**
 * Best guess at the visitor's currency before the server answers: India's
 * timezone means INR, anything else USD. The server makes the real call from
 * the request country (x-vercel-ip-country).
 */
export function guessCurrency(): Currency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') return 'INR'
  } catch {
    // Intl without timezone support: fall through.
  }
  return 'USD'
}

let cached: Promise<BillingStatusResponse | null> | null = null

/** Fetches GET /api/billing/status once per page load. Null when signed out or on error. */
export function fetchBillingStatus(force = false): Promise<BillingStatusResponse | null> {
  if (cached && !force) return cached
  cached = fetch('/api/billing/status', { headers: { Accept: 'application/json' }, cache: 'no-store' })
    .then(async (res) => (res.ok ? ((await res.json()) as BillingStatusResponse) : null))
    .catch(() => null)
    .then((value) => {
      if (value === null) cached = null // let a later open retry
      return value
    })
  return cached
}

/** Drops the cached status, e.g. after a successful checkout. */
export function invalidateBillingStatus(): void {
  cached = null
}

/**
 * Billing status for UI that only needs it while visible (the upgrade dialog).
 * `enabled` false skips the request.
 */
export function useBillingStatus(enabled: boolean): { status: BillingStatusResponse | null; loading: boolean } {
  const [status, setStatus] = React.useState<BillingStatusResponse | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!enabled) return
    let alive = true
    setLoading(true)
    fetchBillingStatus().then((value) => {
      if (!alive) return
      setStatus(value)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [enabled])

  return { status, loading }
}
