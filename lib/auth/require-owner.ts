import { getRepo } from '@/lib/db/queries/repos'
import { getDraft } from '@/lib/db/queries/drafts'
import { getJob } from '@/lib/db/queries/jobs'

class OwnershipError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function requireRepoOwner(repoId: string, userId: string) {
  const repo = await getRepo(repoId)
  if (!repo) throw new OwnershipError(404, 'Not found')
  if (repo.userId !== userId) throw new OwnershipError(403, 'Forbidden')
  return repo
}

export async function requireDraftOwner(draftId: string, userId: string) {
  const draft = await getDraft(draftId)
  if (!draft) throw new OwnershipError(404, 'Not found')
  if (draft.userId !== userId) throw new OwnershipError(403, 'Forbidden')
  return draft
}

export async function requireJobOwner(jobId: string, userId: string) {
  const job = await getJob(jobId)
  if (!job) throw new OwnershipError(404, 'Not found')
  if (job.userId !== userId) throw new OwnershipError(403, 'Forbidden')
  return job
}

export function ownershipErrorToResponse(err: unknown) {
  if (err instanceof OwnershipError) {
    return Response.json({ error: err.message }, { status: err.status })
  }
  return null
}
