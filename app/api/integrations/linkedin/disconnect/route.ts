import { auth } from '@/auth'
import { isConfigured } from '@/lib/env'
import { decrypt } from '@/lib/auth/encrypt'
import { deleteLinkedInConnection } from '@/lib/db/queries/integrations'
import { revokeLinkedInToken } from '@/lib/publish/linkedin'
import { unauthorized } from '@/lib/validators/http'

/** Removes the LinkedIn connection and asks LinkedIn to revoke the token. */
export async function POST() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const removed = await deleteLinkedInConnection(userId)
  if (removed && isConfigured('linkedin')) {
    try {
      await revokeLinkedInToken(decrypt(removed.accessTokenEnc))
    } catch (err) {
      console.warn('[linkedin] revoke on disconnect failed', err)
    }
  }
  return Response.json({ ok: true })
}
