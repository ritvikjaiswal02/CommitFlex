import { auth } from '@/auth'
import { listAutopilotRepos, getRepo } from '@/lib/db/queries/repos'
import { getAutopilotSettings } from '@/lib/db/queries/autopilot'
import { getGithubAccessToken } from '@/lib/db/queries/integrations'
import { getRepoActivity } from '@/lib/github/activity'
import { startGenerationJob, startJobErrorResponse } from '@/lib/pipeline/start'
import { AutopilotRunSchema } from '@/lib/validators/autopilot'
import { apiError, invalidRequest, readJson, unauthorized } from '@/lib/validators/http'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

const RUN_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 5 }
const WINDOW_DAYS = 7

/**
 * "Run autopilot now": writes drafts from the last 7 days of a repo and queues
 * them like any autopilot run. Defaults to the most recently active repo.
 */
export async function POST(req: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const rl = await checkRateLimit(`autopilot-run:${userId}`, RUN_RATE_LIMIT)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  const parsed = AutopilotRunSchema.safeParse((await readJson(req, {})) ?? {})
  if (!parsed.success) return invalidRequest(parsed.error)

  const now = new Date()
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 3600_000)

  let repoId = parsed.data.repoId
  if (repoId) {
    const repo = await getRepo(repoId)
    if (!repo || repo.userId !== userId || repo.deletedAt) return apiError(404, 'not_found', 'That repository is not connected.')
  } else {
    const repos = await listAutopilotRepos(userId)
    if (repos.length === 0) {
      return apiError(404, 'not_found', 'Connect a repository and turn autopilot on for it first.')
    }
    repoId = repos[0].id
    const token = await getGithubAccessToken(userId)
    if (token && repos.length > 1) {
      let latest = -1
      for (const repo of repos.slice(0, 6)) {
        const activity = await getRepoActivity({ accessToken: token, fullName: repo.fullName, since: windowStart, until: now })
        const t = activity.latestAt?.getTime() ?? -1
        if (activity.meaningful > 0 && t > latest) {
          latest = t
          repoId = repo.id
        }
      }
    }
  }

  const settings = await getAutopilotSettings(userId)
  const result = await startGenerationJob({
    userId,
    repoId,
    source: { type: 'window', windowStart, windowEnd: now },
    trigger: 'cadence',
    voiceProfileId: settings.defaultVoiceProfileId,
    autoQueue: true,
  })
  if (!result.ok) return startJobErrorResponse(result)
  return Response.json({ jobId: result.jobId }, { status: 202 })
}
