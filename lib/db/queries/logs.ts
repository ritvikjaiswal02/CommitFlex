import { db } from '@/lib/db/client'
import { aiGenerationLogs } from '@/lib/db/schema'

export async function persistAILog(params: {
  jobId: string
  stage: string
  promptTokens: number
  completionTokens: number
  promptVersion: string
}) {
  await db.insert(aiGenerationLogs).values({
    jobId: params.jobId,
    stage: params.stage,
    model: 'gemini-1.5-pro',
    promptVersion: params.promptVersion,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    promptText: '',
    outputText: '',
    estimatedCostUsd: estimateCost(params.promptTokens, params.completionTokens).toFixed(6),
    durationMs: 0,
    success: true,
  })
}

export function estimateCost(promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1_000_000) * 3.0 + (completionTokens / 1_000_000) * 15.0
}
