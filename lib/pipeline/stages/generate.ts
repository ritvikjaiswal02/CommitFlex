import { generatePosts } from '@/lib/ai/posts'
import { persistDrafts } from '@/lib/db/queries/drafts'
import { persistAILog } from '@/lib/db/queries/logs'
import { emitEvent } from '@/lib/db/queries/events'
import { updateJobStatus } from '@/lib/db/queries/jobs'
import type { GenerationJob, VoiceSettings } from '@/types/jobs'
import type { Narrative } from '@/types/ai'

export interface GenerateStageResult {
  linkedinDraftId: string | null
  twitterDraftId: string | null
  partial: boolean
  errors: { linkedin?: string; twitter?: string }
}

export async function stageGenerate(job: GenerationJob, narrative: Narrative, voice: VoiceSettings): Promise<GenerateStageResult> {
  await updateJobStatus(job.id, 'generating_posts')
  await emitEvent(job.id, 'stage_started', { stage: 'generate' })

  const { linkedin, twitter, errors } = await generatePosts(narrative, voice)

  const drafts: Array<{ platform: 'linkedin' | 'twitter'; content: string; hashtags: string[]; callToAction?: string }> = []
  if (linkedin) {
    drafts.push({ platform: 'linkedin', content: linkedin.post.content, hashtags: linkedin.post.hashtags, callToAction: linkedin.post.callToAction })
    await persistAILog({ jobId: job.id, stage: 'generate_linkedin', promptTokens: linkedin._meta.promptTokens, completionTokens: linkedin._meta.completionTokens, promptVersion: linkedin._meta.promptVersion })
  }
  if (twitter) {
    drafts.push({ platform: 'twitter', content: twitter.post.content, hashtags: twitter.post.hashtags })
    await persistAILog({ jobId: job.id, stage: 'generate_twitter', promptTokens: twitter._meta.promptTokens, completionTokens: twitter._meta.completionTokens, promptVersion: twitter._meta.promptVersion })
  }

  const persistedDrafts = await persistDrafts(job.id, job.userId, drafts)

  const linkedinDraft = persistedDrafts.find(d => d.platform === 'linkedin') ?? null
  const twitterDraft = persistedDrafts.find(d => d.platform === 'twitter') ?? null
  const partial = !linkedin || !twitter

  await emitEvent(job.id, 'stage_completed', { stage: 'generate', partial, errors })

  return {
    linkedinDraftId: linkedinDraft?.id ?? null,
    twitterDraftId: twitterDraft?.id ?? null,
    partial,
    errors,
  }
}
