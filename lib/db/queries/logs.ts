import { db } from '@/lib/db/client'
import { aiGenerationLogs } from '@/lib/db/schema'

export const DEFAULT_MODEL = 'gemini-2.5-flash'

export async function persistAILog(params: {
  jobId: string
  stage: string
  promptTokens: number
  completionTokens: number
  promptVersion: string
  model?: string
  durationMs?: number
}) {
  await db.insert(aiGenerationLogs).values({
    jobId: params.jobId,
    stage: params.stage,
    model: params.model ?? DEFAULT_MODEL,
    promptVersion: params.promptVersion,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    promptText: '',
    outputText: '',
    estimatedCostUsd: estimateCost(params.promptTokens, params.completionTokens, params.model).toFixed(6),
    durationMs: params.durationMs ?? 0,
    success: true,
  })
}

/** USD per million tokens (input, output). Unknown models fall back to Gemini Flash rates. */
const RATES: Record<string, [number, number]> = {
  'gemini-2.5-flash': [0.3, 2.5],
  'claude-haiku-4-5': [1, 5],
}

export function estimateCost(promptTokens: number, completionTokens: number, model: string = DEFAULT_MODEL): number {
  const [input, output] = RATES[model] ?? RATES[DEFAULT_MODEL]
  return (promptTokens / 1_000_000) * input + (completionTokens / 1_000_000) * output
}
