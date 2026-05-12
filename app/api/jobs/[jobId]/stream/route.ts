import { auth } from '@/auth'
import { requireJobOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { getJob } from '@/lib/db/queries/jobs'
import { getDraftsByJob } from '@/lib/db/queries/drafts'

const TERMINAL_STATUSES = new Set(['completed', 'partial_completed', 'failed', 'cancelled'])
const POLL_INTERVAL_MS = 2000

export async function GET(_req: Request, { params }: { params: { jobId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await requireJobOwner(params.jobId, session.user.id)
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    throw err
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      let lastStatus = ''
      let ticks = 0
      const MAX_TICKS = 150 // 5 minutes max

      while (ticks < MAX_TICKS) {
        const job = await getJob(params.jobId)
        if (!job) { send('error', { message: 'Job not found' }); break }

        if (job.status !== lastStatus) {
          lastStatus = job.status
          const drafts = TERMINAL_STATUSES.has(job.status) ? await getDraftsByJob(params.jobId) : []
          send('update', { status: job.status, drafts })
        }

        if (TERMINAL_STATUSES.has(job.status)) break

        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
        ticks++
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
