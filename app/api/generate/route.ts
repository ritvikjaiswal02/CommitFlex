import { auth } from '@/auth'
import { hasActiveJob, createJob, getUserJobs } from '@/lib/db/queries/jobs'
import { requireRepoOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { CreateJobSchema } from '@/lib/validators/jobs'
import { runPipeline } from '@/lib/pipeline/run'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

// 5 generations per user per hour
const GENERATE_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 5 }

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = checkRateLimit(`generate:${session.user.id}`, GENERATE_RATE_LIMIT)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  const body = await req.json().catch(() => null)
  const parsed = CreateJobSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const input = parsed.data
  const { repoId } = input

  try {
    const repo = await requireRepoOwner(repoId, session.user.id)

    const active = await hasActiveJob(repoId)
    if (active) return Response.json({ error: 'A generation job is already running for this repo' }, { status: 409 })

    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, session.user.id), eq(accounts.provider, 'github')))
      .limit(1)

    if (!account?.access_token) {
      return Response.json({ error: 'No GitHub account connected' }, { status: 400 })
    }

    // Decide sourceType + window bookends. For PR/release jobs the window is
    // metadata only — the fetch stage will read sourceType + sourceRef and
    // pull commits from the right place. Wide windows here keep any
    // legacy filtering happy.
    let sourceType: 'window' | 'pr' | 'release' = 'window'
    let sourceRef: string | null = null
    let windowStart: Date
    let windowEnd: Date

    if (!('source' in input) || input.source === 'window') {
      windowStart = new Date(input.windowStart)
      windowEnd = new Date(input.windowEnd)
    } else if (input.source === 'pr') {
      sourceType = 'pr'
      sourceRef = input.prUrl
      const oneYearAgo = new Date()
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      windowStart = oneYearAgo
      windowEnd = new Date()
    } else {
      // release
      sourceType = 'release'
      sourceRef = input.releaseTag
      const oneYearAgo = new Date()
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      windowStart = oneYearAgo
      windowEnd = new Date()
    }

    const job = await createJob({
      userId: session.user.id,
      repoId,
      windowStart,
      windowEnd,
      sourceType,
      sourceRef,
    })

    const repoUrl = repo.url ?? `https://github.com/${repo.fullName}`
    // Fire-and-forget pipeline — response returns immediately
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runPipeline(job as any, repoUrl, account.access_token).catch(console.error)

    return Response.json({ jobId: job.id }, { status: 202 })
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    throw err
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const jobs = await getUserJobs(session.user.id)
  return Response.json({ jobs })
}
