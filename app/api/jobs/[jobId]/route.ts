import { auth } from '@/auth'
import { getDraftsByJob } from '@/lib/db/queries/drafts'
import { updateJobStatus } from '@/lib/db/queries/jobs'
import { getRepo } from '@/lib/db/queries/repos'
import { listQueue } from '@/lib/db/queries/autopilot'
import { requireJobOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { apiError, unauthorized } from '@/lib/validators/http'
import { TERMINAL_JOB_STATUSES } from '@/types/jobs'

export async function GET(_req: Request, { params }: { params: { jobId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  try {
    const job = await requireJobOwner(params.jobId, session.user.id)
    const [drafts, repo, queue] = await Promise.all([
      getDraftsByJob(params.jobId),
      getRepo(job.repoId),
      listQueue(session.user.id, { jobId: params.jobId, limit: 50 }),
    ])
    // Slim the repo down to only what the client renders so we don't leak
    // webhook secrets and other internal fields.
    const repoForClient = repo ? { id: repo.id, fullName: repo.fullName, defaultBranch: repo.defaultBranch } : null
    return Response.json({ job, drafts, repo: repoForClient, queue })
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    throw err
  }
}

export async function DELETE(_req: Request, { params }: { params: { jobId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  try {
    const job = await requireJobOwner(params.jobId, session.user.id)
    if ((TERMINAL_JOB_STATUSES as readonly string[]).includes(job.status)) {
      return apiError(409, 'invalid_state', 'This run already finished.')
    }
    await updateJobStatus(params.jobId, 'cancelled')
    return new Response(null, { status: 204 })
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    throw err
  }
}
