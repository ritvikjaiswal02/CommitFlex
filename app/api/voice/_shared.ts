import { z } from 'zod'
import { getVoiceProfile, type VoiceProfile } from '@/lib/db/queries/voice'

export const EXTRA_CONTEXT_MAX = 4000

export const VoiceFieldsSchema = z.object({
  tone: z.string().trim().min(1).max(50),
  technicalLevel: z.number().int().min(1).max(10),
  audience: z.string().trim().min(1).max(100),
  extraContext: z.string().max(EXTRA_CONTEXT_MAX).optional(),
})

export function unauthorized(): Response {
  return Response.json({ error: 'Sign in to continue', code: 'unauthorized' }, { status: 401 })
}

export function invalidRequest(issues: unknown): Response {
  return Response.json({ error: 'Some fields need another look', code: 'invalid_request', issues }, { status: 400 })
}

export function serverError(message: string): Response {
  return Response.json({ error: message, code: 'internal_error' }, { status: 500 })
}

/** Loads a voice profile and checks it belongs to the user. */
export async function ownProfile(
  profileId: string,
  userId: string,
): Promise<{ profile: VoiceProfile } | { error: Response }> {
  const profile = await getVoiceProfile(profileId)
  if (!profile) return { error: Response.json({ error: 'Voice profile not found', code: 'not_found' }, { status: 404 }) }
  if (profile.userId !== userId) {
    return { error: Response.json({ error: 'This voice profile belongs to another account', code: 'forbidden' }, { status: 403 }) }
  }
  return { profile }
}

/** Shape sent to the client: dates as ISO strings, only the fields the UI uses. */
export function serializeProfile(p: VoiceProfile) {
  return {
    id: p.id,
    name: p.name,
    isDefault: p.isDefault,
    tone: p.tone,
    technicalLevel: p.technicalLevel,
    audience: p.audience,
    extraContext: p.extraContext ?? null,
    createdAt: new Date(p.createdAt).toISOString(),
    updatedAt: new Date(p.updatedAt).toISOString(),
  }
}
