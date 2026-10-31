import { isCurrency } from '@/lib/billing/catalog'
import { listSubscriptionInvoices, minorToMajor, type RazorpayInvoice } from '@/lib/billing/razorpay'
import { listSubscriptions } from '@/lib/db/queries/billing'
import { isConfigured } from '@/lib/env'
import type { InvoiceView } from '@/components/billing/types'
import { getSessionUser, jsonError, unauthorized } from '../_lib/http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Subscriptions that never got past checkout have no invoices. */
const NO_INVOICE_STATUSES = new Set(['created'])
/** Look back at most this many subscriptions (newest first). */
const MAX_SUBSCRIPTIONS = 6

function describe(plan: string, interval: string): string {
  const name = plan === 'team' ? 'Team' : 'Pro'
  return `${name}, ${interval === 'year' ? 'yearly' : 'monthly'}`
}

/** GET /api/billing/invoices: Razorpay invoices across the user's subscriptions, newest first. */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  try {
    if (!isConfigured('razorpay')) return Response.json({ invoices: [] })

    const subs = (await listSubscriptions(user.id))
      .filter((s) => !NO_INVOICE_STATUSES.has(s.status))
      .slice(0, MAX_SUBSCRIPTIONS)
    if (subs.length === 0) return Response.json({ invoices: [] })

    const results = await Promise.allSettled(subs.map((s) => listSubscriptionInvoices(s.razorpaySubscriptionId)))
    const failures = results.filter((r) => r.status === 'rejected')
    if (failures.length === results.length) {
      console.error('[billing] invoices: every Razorpay call failed', (failures[0] as PromiseRejectedResult).reason)
      return jsonError(502, 'upstream_error', "Razorpay didn't return your invoices. Try again in a minute.")
    }

    const seen = new Set<string>()
    const invoices: InvoiceView[] = []
    results.forEach((result, i) => {
      if (result.status !== 'fulfilled') return
      const sub = subs[i]
      for (const inv of result.value as RazorpayInvoice[]) {
        if (seen.has(inv.id)) continue
        seen.add(inv.id)
        const currency = inv.currency?.toUpperCase()
        invoices.push({
          id: inv.id,
          amount: minorToMajor(inv.amount),
          currency: isCurrency(currency) ? currency : isCurrency(sub.currency) ? sub.currency : 'INR',
          status: inv.status,
          date: inv.date ? new Date(inv.date * 1000).toISOString() : null,
          url: inv.short_url,
          description: describe(sub.plan, sub.interval),
        })
      }
    })
    invoices.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

    return Response.json({ invoices, partial: failures.length > 0 }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[billing] invoices failed', err)
    return jsonError(500, 'internal_error', "We couldn't load your invoices. Try again in a minute.")
  }
}
