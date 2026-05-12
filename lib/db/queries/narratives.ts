import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { extractedNarratives } from '@/lib/db/schema'
import type { Narrative } from '@/types/ai'

export async function persistNarrative(jobId: string, narrative: Narrative) {
  const [row] = await db.insert(extractedNarratives).values({
    jobId,
    story: narrative.story,
    angle: narrative.theme,
    targetAudience: String(narrative.technicalDepth),
    keyInsights: narrative.keyPoints,
    suggestedHook: narrative.story.split('.')[0] ?? narrative.theme,
  }).returning()
  return row
}

export async function getNarrative(id: string) {
  const [row] = await db.select().from(extractedNarratives).where(eq(extractedNarratives.id, id)).limit(1)
  return row ?? null
}

export async function getNarrativeByJob(jobId: string) {
  const [row] = await db.select().from(extractedNarratives).where(eq(extractedNarratives.jobId, jobId)).limit(1)
  return row ?? null
}
