import { and, eq, asc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { voiceSettings } from '@/lib/db/schema'
import type { VoiceSettings } from '@/types/jobs'

export type VoiceProfile = typeof voiceSettings.$inferSelect

/* ─── Read ────────────────────────────────────────────────────────────── */

/**
 * Returns the user's default profile coerced to the lightweight VoiceSettings
 * shape the AI pipeline consumes. Keeps backward compat with the rest of the
 * codebase that knew about a single voice per user.
 */
export async function getVoiceSettings(userId: string): Promise<VoiceSettings | null> {
  const row = await getDefaultVoiceProfile(userId)
  if (!row) return null
  return {
    tone: row.tone,
    technicalLevel: row.technicalLevel,
    audience: row.audience,
    extraContext: row.extraContext ?? undefined,
  }
}

export async function getDefaultVoiceProfile(userId: string): Promise<VoiceProfile | null> {
  // Prefer the row marked as default; fall back to the oldest profile when
  // some inconsistency has snuck in (shouldn't happen but defensive).
  const rows = await db.select().from(voiceSettings)
    .where(eq(voiceSettings.userId, userId))
    .orderBy(asc(voiceSettings.createdAt))
  if (rows.length === 0) return null
  return rows.find(r => r.isDefault) ?? rows[0]
}

export async function listVoiceProfiles(userId: string): Promise<VoiceProfile[]> {
  return db.select().from(voiceSettings)
    .where(eq(voiceSettings.userId, userId))
    .orderBy(asc(voiceSettings.createdAt))
}

export async function getVoiceProfile(id: string): Promise<VoiceProfile | null> {
  const [row] = await db.select().from(voiceSettings).where(eq(voiceSettings.id, id)).limit(1)
  return row ?? null
}

/* ─── Write ───────────────────────────────────────────────────────────── */

interface VoiceProfileInput {
  tone: string
  technicalLevel: number
  audience: string
  extraContext?: string
  name?: string
}

/**
 * Backward-compat for code that just wants to save "the user's voice".
 * Updates the default profile if present, otherwise creates a first one
 * marked as default. Other profiles remain untouched.
 */
export async function upsertVoiceSettings(userId: string, settings: VoiceSettings): Promise<VoiceProfile> {
  const existing = await getDefaultVoiceProfile(userId)
  if (existing) {
    const [updated] = await db.update(voiceSettings)
      .set({
        tone: settings.tone,
        technicalLevel: settings.technicalLevel,
        audience: settings.audience,
        extraContext: settings.extraContext,
        updatedAt: new Date(),
      })
      .where(eq(voiceSettings.id, existing.id))
      .returning()
    return updated
  }
  const [created] = await db.insert(voiceSettings).values({
    userId,
    name: 'Default',
    isDefault: true,
    tone: settings.tone,
    technicalLevel: settings.technicalLevel,
    audience: settings.audience,
    extraContext: settings.extraContext,
  }).returning()
  return created
}

/**
 * Create a new profile. If `makeDefault` is true, all other profiles for the
 * user get isDefault=false first (in a transaction).
 */
export async function createVoiceProfile(
  userId: string,
  input: VoiceProfileInput & { makeDefault?: boolean },
): Promise<VoiceProfile> {
  return db.transaction(async (tx) => {
    if (input.makeDefault) {
      await tx.update(voiceSettings)
        .set({ isDefault: false })
        .where(eq(voiceSettings.userId, userId))
    }
    // If this is the user's first profile we force it to default regardless.
    const existing = await tx.select({ id: voiceSettings.id }).from(voiceSettings)
      .where(eq(voiceSettings.userId, userId)).limit(1)
    const isFirst = existing.length === 0

    const [row] = await tx.insert(voiceSettings).values({
      userId,
      name: input.name ?? 'Profile',
      isDefault: !!(input.makeDefault || isFirst),
      tone: input.tone,
      technicalLevel: input.technicalLevel,
      audience: input.audience,
      extraContext: input.extraContext,
    }).returning()
    return row
  })
}

export async function updateVoiceProfile(
  id: string,
  patch: Partial<VoiceProfileInput>,
): Promise<VoiceProfile | null> {
  const [row] = await db.update(voiceSettings)
    .set({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.tone !== undefined && { tone: patch.tone }),
      ...(patch.technicalLevel !== undefined && { technicalLevel: patch.technicalLevel }),
      ...(patch.audience !== undefined && { audience: patch.audience }),
      ...(patch.extraContext !== undefined && { extraContext: patch.extraContext }),
      updatedAt: new Date(),
    })
    .where(eq(voiceSettings.id, id))
    .returning()
  return row ?? null
}

/**
 * Flip the default flag to the chosen profile and clear it on every other
 * profile belonging to the same user. Atomic.
 */
export async function setDefaultProfile(userId: string, id: string): Promise<VoiceProfile | null> {
  return db.transaction(async (tx) => {
    await tx.update(voiceSettings)
      .set({ isDefault: false })
      .where(eq(voiceSettings.userId, userId))
    const [row] = await tx.update(voiceSettings)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(voiceSettings.id, id), eq(voiceSettings.userId, userId)))
      .returning()
    return row ?? null
  })
}

/**
 * Delete a profile. Callers should refuse the request when this is the user's
 * last profile, but we also guard here. If the deleted row was the default,
 * promote the next-oldest profile to default.
 */
export async function deleteVoiceProfile(userId: string, id: string): Promise<{ deleted: boolean; reason?: string }> {
  return db.transaction(async (tx) => {
    const all = await tx.select().from(voiceSettings)
      .where(eq(voiceSettings.userId, userId))
      .orderBy(asc(voiceSettings.createdAt))
    if (all.length <= 1) return { deleted: false, reason: 'last_profile' }

    const target = all.find(r => r.id === id)
    if (!target) return { deleted: false, reason: 'not_found' }

    await tx.delete(voiceSettings).where(eq(voiceSettings.id, id))

    if (target.isDefault) {
      const next = all.find(r => r.id !== id)!
      await tx.update(voiceSettings)
        .set({ isDefault: true })
        .where(eq(voiceSettings.id, next.id))
    }
    return { deleted: true }
  })
}
