'use server'

import { auth } from '@/auth'
import { getUserProfile } from '@/lib/db/queries/onboarding'
import { listVoiceProfiles, upsertVoiceSettings } from '@/lib/db/queries/voice'
import { TONE_TO_VOICE, audienceSummary, isTonePreset } from '@/components/onboarding/questions'

/**
 * Creates the default voice profile for an account that has none (accounts
 * from before onboarding wrote one). Called lazily by the voice editor, so
 * rendering Settings never writes to the database.
 */
export async function ensureDefaultVoiceProfile(): Promise<{ created: boolean }> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { created: false }
  const existing = await listVoiceProfiles(userId)
  if (existing.length > 0) return { created: false }
  const profile = await getUserProfile(userId)
  const preset =
    profile && isTonePreset(profile.tonePreset)
      ? TONE_TO_VOICE[profile.tonePreset]
      : { tone: 'professional', technicalLevel: 7 }
  await upsertVoiceSettings(userId, { ...preset, audience: audienceSummary(profile?.audiences ?? []) })
  return { created: true }
}
