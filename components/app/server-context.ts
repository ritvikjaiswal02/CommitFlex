import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getUserProfile, type UserProfile } from '@/lib/db/queries/onboarding'
import { getLinkedInConnectionSummary } from '@/lib/db/queries/integrations'
import { getUserPlan, planHasFeature, type Plan } from '@/lib/plans'
import type { LinkedInConnectionSummary } from '@/types/autopilot'
import { safeTimeZone } from '@/components/app/format'

/**
 * Server-only helpers shared by the app pages (P4). Never import this file
 * from a 'use client' module: it reaches the database.
 */

export interface AppUser {
  id: string
  name: string | null
  email: string | null
  image: string | null
}

export interface AppContext {
  user: AppUser
  profile: UserProfile | null
  timezone: string
}

/**
 * Signed-in user for an app page. Redirects to /login when signed out and to
 * /onboarding until `user_profiles.onboarded_at` is set (PRODUCT_SPEC §5 Flow A).
 */
export async function requireAppUser(next: string, opts: { onboarding?: boolean } = {}): Promise<AppContext> {
  const session = await auth()
  const id = session?.user?.id
  if (!id) redirect(`/login?next=${encodeURIComponent(next)}`)

  const profile = await getUserProfile(id)
  if (opts.onboarding !== false && !profile?.onboardedAt) redirect('/onboarding')

  return {
    user: {
      id,
      name: session.user?.name ?? null,
      email: session.user?.email ?? null,
      image: session.user?.image ?? null,
    },
    profile,
    timezone: safeTimeZone(profile?.timezone),
  }
}

export type Settled<T> = { ok: true; value: T } | { ok: false; error: string }

/** Runs a loader without failing the whole page; panels show an error state instead. */
export async function settle<T>(promise: Promise<T>, label: string): Promise<Settled<T>> {
  try {
    return { ok: true, value: await promise }
  } catch (err) {
    console.error(`[app] ${label} failed`, err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function valueOr<T>(result: Settled<T>, fallback: T): T {
  return result.ok ? result.value : fallback
}

export interface PublishingContext {
  plan: Plan | null
  linkedin: LinkedInConnectionSummary | null
  /** LinkedIn connected and active, and the plan includes direct publishing. */
  linkedinDirect: boolean
}

export async function loadPublishingContext(userId: string): Promise<PublishingContext> {
  const [plan, linkedin] = await Promise.all([
    settle(getUserPlan(userId), 'getUserPlan'),
    settle(getLinkedInConnectionSummary(userId), 'getLinkedInConnectionSummary'),
  ])
  const planValue = valueOr(plan, null)
  const linkedinValue = valueOr(linkedin, null)
  const linkedinDirect =
    linkedinValue?.status === 'active' && planHasFeature(planValue?.id ?? 'free', 'publish.linkedin_direct')
  return { plan: planValue, linkedin: linkedinValue, linkedinDirect }
}

/** Serializes a Date (or null) for client props. */
export function iso(date: Date | string | null | undefined): string | null {
  if (!date) return null
  const d = date instanceof Date ? date : new Date(date)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
