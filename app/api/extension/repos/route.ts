import { z } from 'zod'
import { toClientRepo } from '@/lib/db/queries/repos'
import { RepoConnectError, connectRepo } from '@/lib/repos/connect'
import { corsError, corsJson, preflight, readJsonBody, withExtensionToken } from '../_lib/http'
import type { RepoRow } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3)
    .max(255)
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'Use owner/name')
    .refine((v) => v.split('/').every((part) => !/^\.+$/.test(part)), 'Use owner/name'),
})

export function OPTIONS() {
  return preflight()
}

/**
 * POST /api/extension/repos { fullName }
 * Connects a repository from a github.com page in one click (the same logic
 * as POST /api/repos: read from GitHub with the user's token, push access
 * required, webhook installed when the user is an admin).
 */
export async function POST(req: Request) {
  return withExtensionToken(req, 'connect repository', async ({ userId }) => {
    const parsed = BodySchema.safeParse((await readJsonBody(req)) ?? null)
    if (!parsed.success) {
      return corsJson(
        { error: 'Send { fullName: "owner/name" }', code: 'invalid_request', issues: parsed.error.flatten() },
        { status: 400 },
      )
    }
    try {
      const { repo, warning } = await connectRepo(userId, { fullName: parsed.data.fullName })
      const client = toClientRepo(repo)
      return corsJson(
        { ok: true, repo: { id: client.id, fullName: client.fullName, webhookConfigured: client.webhookConfigured }, ...(warning ? { warning } : {}) },
        { status: 201 },
      )
    } catch (err) {
      if (err instanceof RepoConnectError) {
        const existing = err.extra?.repo as RepoRow | undefined
        if (existing) {
          return corsJson({ ok: true, repo: { id: existing.id, fullName: existing.fullName, webhookConfigured: !!existing.webhookId } })
        }
        return corsError(err.status, err.code, err.message)
      }
      throw err
    }
  })
}
