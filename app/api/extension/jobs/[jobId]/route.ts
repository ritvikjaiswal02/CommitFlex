import { appUrl } from '@/lib/env'
import { getJob } from '@/lib/db/queries/jobs'
import { getDraftsByJob } from '@/lib/db/queries/drafts'
import { getRepo } from '@/lib/db/queries/repos'
import { getQueueItemByDraft } from '@/lib/db/queries/autopilot'
import { draftRowToExtensionItem, jobUrl, type ExtensionItem } from '../../_lib/items'
import { corsJson, isUuid, notFound, preflight, withExtensionToken } from '../../_lib/http'

export const dynamic = 'force-dynamic'

const TERMINAL = new Set(['completed', 'partial_completed', 'failed', 'cancelled'])

export function OPTIONS() {
  return preflight()
}

/**
 * GET /api/extension/jobs/:jobId
 * Progress for a job the extension started: `{ status, drafts }`, plus
 * `done`, the job URL and the error message when it failed.
 */
export async function GET(req: Request, { params }: { params: { jobId: string } }) {
  return withExtensionToken(req, 'job status', async ({ userId }) => {
    if (!isUuid(params.jobId)) return notFound('Job not found')
    const job = await getJob(params.jobId)
    if (!job || job.userId !== userId) return notFound('Job not found')

    const base = appUrl()
    const [rows, repo] = await Promise.all([getDraftsByJob(job.id), getRepo(job.repoId)])
    const repoFullName = repo?.fullName ?? ''
    const queueItems = await Promise.all(rows.map((row) => getQueueItemByDraft(userId, row.id)))

    const drafts = rows
      .map((row, i) => draftRowToExtensionItem(row, { base, repoFullName, queue: queueItems[i] ?? null }))
      .filter((item): item is ExtensionItem => item !== null)
      .sort((a, b) => (a.platform === b.platform ? 0 : a.platform === 'linkedin' ? -1 : 1))

    return corsJson({
      status: job.status,
      done: TERMINAL.has(job.status),
      errorMessage: job.status === 'failed' ? job.errorMessage ?? null : null,
      repoFullName,
      jobUrl: jobUrl(base, job.id),
      drafts,
    })
  })
}
