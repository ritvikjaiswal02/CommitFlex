import { db } from '@/lib/db/client'
import { commitSummaries } from '@/lib/db/schema'
import type { CommitSummary } from '@/types/ai'

export async function persistCommitSummary(jobId: string, summary: CommitSummary) {
  const [row] = await db.insert(commitSummaries).values({
    jobId,
    headline: summary.summary,
    keyChanges: summary.tags,
    technicalDetails: `SHA: ${summary.sha}, Significance: ${summary.significance}/10`,
    buildContext: summary.summary,
  }).returning()
  return row
}
