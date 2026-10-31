import { auth } from '@/auth'
import { getUserJobs } from '@/lib/db/queries/jobs'
import { getVoiceProfile } from '@/lib/db/queries/voice'
import { CreateJobSchema } from '@/lib/validators/jobs'
import { apiError, invalidRequest, readJson, unauthorized } from '@/lib/validators/http'
import { startGenerationJob, startJobErrorResponse, type StartJobInput } from '@/lib/pipeline/start'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

// 5 generations per user per hour, on top of the plan's monthly limit.
const GENERATE_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 5 }

export async function POST(req: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const rl = await checkRateLimit(`generate:${userId}`, GENERATE_RATE_LIMIT)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  const parsed = CreateJobSchema.safeParse(await readJson(req))
  if (!parsed.success) return invalidRequest(parsed.error)
  const input = parsed.data

  if (input.voiceProfileId) {
    const profile = await getVoiceProfile(input.voiceProfileId)
    if (!profile || profile.userId !== userId) {
      return apiError(404, 'not_found', 'That voice profile was not found.')
    }
  }

  let source: StartJobInput['source']
  if (!('source' in input) || input.source === 'window') {
    const w = input as { windowStart: Date; windowEnd: Date }
    source = { type: 'window', windowStart: new Date(w.windowStart), windowEnd: new Date(w.windowEnd) }
  } else if (input.source === 'pr') {
    source = { type: 'pr', ref: input.prUrl }
  } else {
    source = { type: 'release', ref: input.releaseTag }
  }

  const result = await startGenerationJob({
    userId,
    repoId: input.repoId,
    source,
    trigger: 'manual',
    voiceProfileId: input.voiceProfileId ?? null,
    autoQueue: false,
  })
  if (!result.ok) return startJobErrorResponse(result)
  return Response.json({ jobId: result.jobId }, { status: 202 })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const jobs = await getUserJobs(session.user.id)
  return Response.json({ jobs })
}
