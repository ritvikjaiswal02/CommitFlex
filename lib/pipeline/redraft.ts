/**
 * Shared context for rewriting a single draft (regenerate and variants):
 * the job's stored narrative, the voice the job was written with, and the
 * author context from onboarding.
 */
import { getNarrativeByJob } from '@/lib/db/queries/narratives'
import { getVoiceProfile, getVoiceSettings } from '@/lib/db/queries/voice'
import { getUserProfile, buildAuthorContext } from '@/lib/db/queries/onboarding'
import { getJob } from '@/lib/db/queries/jobs'
import type { Narrative } from '@/types/ai'
import type { VoiceSettings } from '@/types/jobs'

export const DEFAULT_VOICE: VoiceSettings = { tone: 'professional', technicalLevel: 7, audience: 'developers' }

export interface RedraftContext {
  narrative: Narrative
  voice: VoiceSettings
  authorContext: string | null
}

export async function loadRedraftContext(jobId: string, userId: string): Promise<RedraftContext | null> {
  const narrativeRow = await getNarrativeByJob(jobId)
  if (!narrativeRow) return null

  let voice: VoiceSettings | null = null
  const job = await getJob(jobId)
  if (job?.voiceProfileId) {
    const profile = await getVoiceProfile(job.voiceProfileId).catch(() => null)
    if (profile && profile.userId === userId) {
      voice = {
        tone: profile.tone,
        technicalLevel: profile.technicalLevel,
        audience: profile.audience,
        extraContext: profile.extraContext ?? undefined,
      }
    }
  }
  voice = voice ?? (await getVoiceSettings(userId)) ?? DEFAULT_VOICE

  let authorContext: string | null = null
  try {
    authorContext = buildAuthorContext(await getUserProfile(userId)) || null
  } catch {
    authorContext = null
  }

  return {
    narrative: {
      theme: narrativeRow.angle,
      story: narrativeRow.story,
      keyPoints: narrativeRow.keyInsights,
      technicalDepth: Number(narrativeRow.targetAudience) || 7,
    },
    voice,
    authorContext,
  }
}
