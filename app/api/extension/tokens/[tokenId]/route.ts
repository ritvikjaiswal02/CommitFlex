import { auth } from '@/auth'
import { revokeApiToken } from '@/lib/db/queries/tokens'
import { isUuid } from '../../_lib/ids'

export const dynamic = 'force-dynamic'

/** DELETE /api/extension/tokens/:tokenId (session): revokes one of the user's tokens. */
export async function DELETE(_req: Request, { params }: { params: { tokenId: string } }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return Response.json({ error: 'Sign in to manage extension tokens', code: 'unauthorized' }, { status: 401 })
  }

  if (!isUuid(params.tokenId)) {
    return Response.json({ error: 'Token not found', code: 'not_found' }, { status: 404 })
  }
  const revoked = await revokeApiToken(userId, params.tokenId)
  if (!revoked) return Response.json({ error: 'Token not found', code: 'not_found' }, { status: 404 })
  return new Response(null, { status: 204 })
}
