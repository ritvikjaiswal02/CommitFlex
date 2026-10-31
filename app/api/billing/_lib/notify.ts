/**
 * Billing emails (activated, payment failed, cancelled). Server-only and
 * best-effort: a mail failure never fails the webhook that triggered it.
 */
import { eq } from 'drizzle-orm'
import { createElement } from 'react'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { appUrl } from '@/lib/env'
import { sendEmail } from '@/lib/mailer'
import { BillingNoticeEmail } from '@/lib/email/templates/billing-notice'

export type BillingNoticeKind = 'activated' | 'payment_failed' | 'cancelled'

export interface BillingContact {
  email: string
  name: string | null
}

export async function getBillingContact(userId: string): Promise<BillingContact | null> {
  const [row] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!row?.email) return null
  return { email: row.email, name: row.name ?? null }
}

export function firstNameOf(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim()
  if (trimmed) return trimmed.split(/\s+/)[0]
  return email.split('@')[0]
}

/** '12 Dec 2026' in UTC, the same on every server. */
export function formatPeriodEnd(date: Date | null | undefined): string | null {
  if (!date) return null
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
}

const SUBJECTS: Record<BillingNoticeKind, (plan: string) => string> = {
  activated: (plan) => `You're on CommitFlex ${plan}`,
  payment_failed: (plan) => `Your CommitFlex ${plan} payment didn't go through`,
  cancelled: (plan) => `Your CommitFlex ${plan} subscription is cancelled`,
}

function plainText(kind: BillingNoticeKind, plan: string, manageUrl: string, periodEnd: string | null): string {
  switch (kind) {
    case 'activated':
      return `Your ${plan} plan is active. Ship moments, cadence and direct LinkedIn publishing are switched on.\n\nManage billing: ${manageUrl}`
    case 'payment_failed':
      return `We couldn't charge your card for ${plan}. Razorpay will retry automatically. Update your payment method from the link in your Razorpay email, or start a new subscription.\n\nManage billing: ${manageUrl}`
    case 'cancelled':
      return `Your ${plan} subscription is cancelled.${periodEnd ? ` You keep ${plan} until ${periodEnd}, then move to Free.` : ' Your account is on Free now.'} Nothing is deleted.\n\nManage billing: ${manageUrl}`
  }
}

export async function sendBillingNotice(input: {
  userId: string
  kind: BillingNoticeKind
  planName: string
  periodEnd?: Date | null
}): Promise<boolean> {
  try {
    const contact = await getBillingContact(input.userId)
    if (!contact) return false
    const manageUrl = `${appUrl()}/billing`
    const periodEnd = formatPeriodEnd(input.periodEnd ?? null)
    const result = await sendEmail({
      to: contact.email,
      subject: SUBJECTS[input.kind](input.planName),
      react: createElement(BillingNoticeEmail, {
        firstName: firstNameOf(contact.name, contact.email),
        kind: input.kind,
        planName: input.planName,
        manageUrl,
        periodEnd,
      }),
      text: plainText(input.kind, input.planName, manageUrl, periodEnd),
    })
    return result.ok
  } catch (err) {
    console.error('[billing] notice email failed', input.kind, err)
    return false
  }
}
