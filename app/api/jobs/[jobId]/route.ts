import { auth } from '@/auth'
import { getDraftsByJob } from '@/lib/db/queries/drafts'
import { updateJobStatus } from '@/lib/db/queries/jobs'
import { getRepo } from '@/lib/db/queries/repos'
import { requireJobOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'

export async function GET(_req: Request, { params }: { params: { jobId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const job = await requireJobOwner(params.jobId, session.user.id)
    const [drafts, repo] = await Promise.all([
      getDraftsByJob(params.jobId),
      getRepo(job.repoId),
    ])
    // Slim the repo down to only what the client renders so we don't leak
    // webhook secrets and other internal fields.
    const repoForClient = repo
      ? { id: repo.id, fullName: repo.fullName, defaultBranch: repo.defaultBranch }
      : null
    return Response.json({ job, drafts, repo: repoForClient })
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
