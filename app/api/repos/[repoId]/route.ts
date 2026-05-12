import { auth } from '@/auth'
import { softDeleteRepo } from '@/lib/db/queries/repos'
import { requireRepoOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'

export async function DELETE(_req: Request, { params }: { params: { repoId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await requireRepoOwner(params.repoId, session.user.id)
    await softDeleteRepo(params.repoId)
    return new Response(null, { status: 204 })
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    throw err
  }
}
