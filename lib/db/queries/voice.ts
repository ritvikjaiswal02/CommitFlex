import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { voiceSettings } from '@/lib/db/schema'
import type { VoiceSettings } from '@/types/jobs'

export async function getVoiceSettings(userId: string): Promise<VoiceSettings | null> {
  const [row] = await db.select().from(voiceSettings).where(eq(voiceSettings.userId, userId)).limit(1)
  if (!row) return null
  return {
    tone: row.tone,
    technicalLevel: row.technicalLevel,
    audience: row.audience,
    extraContext: row.extraContext ?? undefined,
  }
}

export async function upsertVoiceSettings(userId: string, settings: VoiceSettings) {
  const [row] = await db
    .insert(voiceSettings)
    .values({ userId, tone: settings.tone, technicalLevel: settings.technicalLevel, audience: settings.audience, extraContext: settings.extraContext, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: voiceSettings.userId,
      set: { tone: settings.tone, technicalLevel: settings.technicalLevel, audience: settings.audience, extraContext: settings.extraContext, updatedAt: new Date() },
    })
    .returning()
  return row
}
