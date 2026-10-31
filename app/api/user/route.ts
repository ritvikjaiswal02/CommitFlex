import { eq } from 'drizzle-orm'
import { auth, signOut } from '@/auth'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { isConfigured } from '@/lib/env'
import { getUserPlan } from '@/lib/plans'
import { getEntitledSubscription } from '@/lib/db/queries/billing'
import { cancelSubscription } from '@/lib/billing/razorpay'
import { getUserProfile } from '@/lib/db/queries/onboarding'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return Response.json({ error: 'Sign in to continue', code: 'unauthorized' }, { status: 401 })
}

/** GET /api/user — the signed-in user, their profile and plan. */
export async function GET() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  try {
    const [[user], profile, plan] = await Promise.all([
      db
        .select({ id: users.id, name: users.name, email: users.email, image: users.image })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
      getUserProfile(userId),
      getUserPlan(userId),
    ])
    if (!user) return Response.json({ error: 'Account not found', code: 'not_found' }, { status: 404 })

    return Response.json({
      user,
      profile,
      plan: {
        id: plan.id,
        status: plan.status,
        trialEndsAt: plan.trialEndsAt ? new Date(plan.trialEndsAt).toISOString() : null,
      },
    })
  } catch (err) {
    console.error('[user] GET failed', err)
    return Response.json({ error: 'We couldn’t load your account. Try again.', code: 'internal_error' }, { status: 500 })
  }
}

/**
 * DELETE /api/user — deletes the account and everything that cascades from it.
 * A live Razorpay subscription is cancelled immediately first (best effort),
 * so a deleted account is never charged again.
 */
export async function DELETE() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  if (isConfigured('razorpay')) {
    try {
      const sub = await getEntitledSubscription(userId)
      if (sub?.razorpaySubscriptionId && sub.status !== 'cancelled') {
        await cancelSubscription(sub.razorpaySubscriptionId, { atCycleEnd: false })
      }
    } catch (err) {
      // Keep going: the user asked for deletion. The ids are logged so the
      // subscription can be cancelled by hand from the Razorpay dashboard.
      console.error('[user] subscription cancel failed during account deletion', { userId, err })
    }
  }

  try {
    // ON DELETE CASCADE clears accounts, sessions, repos, jobs, drafts, queue
    // items, profiles, tokens and subscription rows.
    await db.delete(users).where(eq(users.id, userId))
  } catch (err) {
    console.error('[user] delete failed', err)
    return Response.json(
      { error: 'We couldn’t delete your account. Nothing was removed; try again.', code: 'internal_error' },
      { status: 500 },
    )
  }

  try {
    await signOut({ redirect: false })
  } catch {
    // The session cookie may already be gone; the client signs out as well.
  }

  return Response.json({ ok: true })
}
