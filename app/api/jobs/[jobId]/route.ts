import { auth } from '@/auth'
import { getDraftsByJob } from '@/lib/db/queries/drafts'
import { updateJobStatus } from '@/lib/db/queries/jobs'
import { requireJobOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'

export async function GET(_req: Request, { params }: { params: { jobId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const job = await requireJobOwner(params.jobId, session.user.id)
    const drafts = await getDraftsByJob(params.jobId)
    return Response.json({ job, drafts })
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    throw err
  }
}

export async function DELETE(_req: Request, { params }: { params: { jobId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await requireJobOwner(params.jobId, session.user.id)
    await updateJobStatus(params.jobId, 'cancelled')
    return new Response(null, { status: 204 })
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    throw err
  }
}
