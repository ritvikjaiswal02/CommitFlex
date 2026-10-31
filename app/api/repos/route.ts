import { z } from 'zod'
import { auth } from '@/auth'
import { getUserRepos, toClientRepo } from '@/lib/db/queries/repos'
import { RepoConnectError, connectRepo } from '@/lib/repos/connect'
import { planErrorToResponse } from '@/lib/plans'
import type { RepoRow } from '@/lib/db/schema'
import { apiError, invalidRequest, readJson, unauthorized } from '@/lib/validators/http'

/**
 * Only the repository's identity comes from the client. Everything else
 * (name, URL, default branch, visibility) is read from GitHub with the
 * user's token. Older clients still send those fields; they're ignored.
 */
const CreateRepoSchema = z.object({
  githubRepoId: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).transform(Number),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const repos = await getUserRepos(session.user.id)
  return Response.json({ repos: repos.map(toClientRepo) })
}

/**
 * Connects a repo and installs a webhook for push, pull_request and release.
 * A failed webhook install doesn't block the connect: manual drafts and the
 * weekly digest still work, and the user gets a warning.
 */
export async function POST(req: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const parsed = CreateRepoSchema.safeParse(await readJson(req))
  if (!parsed.success) return invalidRequest(parsed.error)

  try {
    const { repo, warning } = await connectRepo(userId, { githubRepoId: parsed.data.githubRepoId })
    return Response.json({ repo: toClientRepo(repo), ...(warning ? { warning } : {}) }, { status: 201 })
  } catch (err) {
    if (err instanceof RepoConnectError) {
      const existing = err.extra?.repo as RepoRow | undefined
      return apiError(err.status, err.code, err.message, existing ? { repo: toClientRepo(existing) } : undefined)
    }
    const res = planErrorToResponse(err)
    if (res) return res
    console.error('[repos] connect failed', err)
    return apiError(502, 'upstream_error', "GitHub didn't answer. Try connecting the repository again in a moment.")
  }
}
