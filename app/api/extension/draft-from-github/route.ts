import { z } from 'zod'
import { appUrl } from '@/lib/env'
import { assertFeature } from '@/lib/plans'
import { checkRateLimit } from '@/lib/rate-limit'
import { parseGithubUrl, type ParsedGithubUrl } from '@/lib/github/url'
import { getUserRepoByFullName } from '@/lib/db/queries/repos'
import { startGenerationJob, type StartJobInput } from '@/lib/pipeline/start'
import { jobUrl } from '../_lib/items'
import { corsError, corsJson, preflight, readJsonBody, withExtensionToken } from '../_lib/http'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  url: z.string().trim().min(1, 'url is required').max(2048),
})

/** A repo-level request drafts from the last week of commits. */
const REPO_WINDOW_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

/** Each request can start a pipeline run, so keep bursts in check. */
const RATE_LIMIT = { windowMs: 60_000, max: 6 }

export function OPTIONS() {
  return preflight()
}

function sourceFor(parsed: ParsedGithubUrl, now = new Date()): StartJobInput['source'] {
  switch (parsed.kind) {
    case 'pr':
      return { type: 'pr', ref: parsed.url }
    case 'release':
      return { type: 'release', ref: parsed.tag }
    case 'repo':
      return { type: 'window', windowStart: new Date(now.getTime() - REPO_WINDOW_DAYS * DAY_MS), windowEnd: now }
  }
}

/**
 * POST /api/extension/draft-from-github  { url }
 * Starts a generation job for a GitHub pull request, release or repository the
 * user has connected. Answers 202 with the job id; the extension polls
 * /api/extension/jobs/:jobId for progress.
 */
export async function POST(req: Request) {
  return withExtensionToken(req, 'draft from github', async ({ userId }) => {
    const body = await readJsonBody(req)
    const parsedBody = BodySchema.safeParse(body ?? null)
    if (!parsedBody.success) {
      return corsJson(
        {
          error: 'Send { url } with a GitHub pull request, release or repository URL',
          code: 'invalid_request',
          issues: parsedBody.error.flatten(),
        },
        { status: 400 },
      )
    }

    const target = parseGithubUrl(parsedBody.data.url)
    if (!target) {
      return corsError(
        400,
        'unsupported_url',
        'CommitFlex can draft from a GitHub pull request, release or repository page. This URL is none of those.',
      )
    }

    const limit = await checkRateLimit(`extension:draft-from-github:${userId}`, RATE_LIMIT)
    if (!limit.allowed) {
      return corsJson(
        { error: 'Too many draft requests in a short time. Wait a minute and try again.', code: 'rate_limited' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))) },
        },
      )
    }

    await assertFeature(userId, 'extension.github_button')

    const fullName = `${target.owner}/${target.repo}`
    const repo = await getUserRepoByFullName(userId, fullName)
    if (!repo || repo.deletedAt) {
      return corsError(
        404,
        'repo_not_connected',
        `${fullName} is not connected to CommitFlex. Connect it, then try again.`,
        { connectUrl: '/repositories', repoFullName: fullName },
      )
    }

    const base = appUrl()
    const result = await startGenerationJob({
      userId,
      repoId: repo.id,
      source: sourceFor(target),
      trigger: 'extension',
      autoQueue: false,
    })

    if (!result.ok) {
      if (result.status === 402 && result.planError) {
        return corsJson(result.planError, { status: 402 })
      }
      return corsJson(
        {
          error: result.error,
          code: result.code,
          ...(result.jobId ? { jobId: result.jobId, jobUrl: jobUrl(base, result.jobId) } : {}),
          repoFullName: repo.fullName,
        },
        { status: result.status },
      )
    }

    return corsJson(
      { jobId: result.jobId, kind: target.kind, repoFullName: repo.fullName, jobUrl: jobUrl(base, result.jobId) },
      { status: 202 },
    )
  })
}
