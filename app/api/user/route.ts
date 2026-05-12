import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth, signOut } from '@/auth'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Cascade delete: schema has ON DELETE CASCADE on accounts, sessions, repos,
  // jobs, and post_drafts — so removing the user row clears everything.
  await db.delete(users).where(eq(users.id, session.user.id))

  // Clear the auth cookie so the client-side signOut() call has nothing to revoke.
  await signOut({ redirect: false })

  return NextResponse.json({ ok: true })
}
