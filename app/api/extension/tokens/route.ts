import { z } from 'zod'
import { auth } from '@/auth'
import { assertWithinLimit, getUserPlan, limitFor, planErrorToResponse } from '@/lib/plans'
import { createApiToken, listApiTokens } from '@/lib/db/queries/tokens'
import { defaultTokenName } from '../_lib/token-name'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  name: z.string().trim().min(1, 'Name the token').max(60, 'Keep the name under 60 characters').optional(),
})

const NO_STORE = { 'Cache-Control': 'no-store' }

function unauthorized() {
  return Response.json({ error: 'Sign in to manage extension tokens', code: 'unauthorized' }, { status: 401 })
}

/** GET /api/extension/tokens (session): the user's live tokens and the plan limit. */
export async function GET() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const [tokens, plan] = await Promise.all([listApiTokens(userId), getUserPlan(userId)])
  return Response.json(
    { tokens, limit: { used: tokens.length, max: limitFor(plan.id, 'extensionTokens') } },
    { headers: NO_STORE },
  )
}

/**
 * POST /api/extension/tokens (session) { name? }
 * Creates a token and returns the plaintext once. 402 when the plan's
 * extensionTokens limit is reached.
 */
export async function POST(req: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  let body: unknown = {}
  const raw = await req.text()
  if (raw.trim() !== '') {
    try {
      body = JSON.parse(raw)
    } catch {
      return Response.json({ error: 'Body must be JSON', code: 'invalid_request' }, { status: 400 })
    }
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid token name', code: 'invalid_request', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    await assertWithinLimit(userId, 'extensionTokens')
    const { token, summary } = await createApiToken(userId, parsed.data.name ?? defaultTokenName(), ['extension'])
    return Response.json({ token, summary }, { status: 201, headers: NO_STORE })
  } catch (err) {
    const planRes = planErrorToResponse(err)
    if (planRes) return planRes
    console.error('[extension] create token failed', err)
    return Response.json(
      { error: 'CommitFlex could not create a token. Try again in a moment.', code: 'internal_error' },
      { status: 500 },
    )
  }
}
