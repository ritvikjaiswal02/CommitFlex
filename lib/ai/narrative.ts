import { readFileSync } from 'fs'
import { join } from 'path'
import { getGeminiClient, aiCircuitBreaker } from './provider'
import { normalizeNarrative } from './normalize'
import type { CommitSummary, Narrative } from '@/types/ai'
import type { VoiceSettings } from '@/types/jobs'

const PROMPT_VERSION = '2.0'
const MODEL = 'gemini-2.5-flash'
const DEFAULT_AUTHOR = 'A software developer sharing their work.'

export interface NarrativeContext {
  /** One or two lines about who is writing (role, what they build, audience). */
  authorContext?: string | null
  /** The pull request description or release notes the job is about. */
  sourceContext?: string | null
}

function loadPrompt(): string {
  return readFileSync(join(process.cwd(), 'lib/ai/prompts/narrative.md'), 'utf8')
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch {}
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(stripped) } catch {}
  const match = stripped.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object found in narrative response')
  return JSON.parse(match[0])
}

/** Most significant first, capped so very large windows stay within budget. */
export function selectSummaries(summaries: CommitSummary[], max = 60): CommitSummary[] {
  if (summaries.length <= max) return summaries
  return [...summaries].sort((a, b) => b.significance - a.significance).slice(0, max)
}

export function buildNarrativePrompt(
  template: string,
  summaries: CommitSummary[],
  voice: VoiceSettings,
  ctx: NarrativeContext = {},
): string {
  const NL = String.fromCharCode(10)
  const summariesText = selectSummaries(summaries)
    .map(s => `- [${s.tags.join(', ')}] ${s.summary} (significance: ${s.significance}/10)`)
    .join(NL)
  const source = ctx.sourceContext?.trim()
  return template
    .replace('{{tone}}', voice.tone)
    .replace('{{technicalLevel}}', String(voice.technicalLevel))
    .replace('{{audience}}', voice.audience)
    .replace('{{authorContext}}', ctx.authorContext?.trim() || DEFAULT_AUTHOR)
    .replace('{{sourceContext}}', source ? `What this is about:${NL}${source}` : '')
    .replace('{{summaries}}', summariesText)
}

export async function extractNarrative(
  summaries: CommitSummary[],
  voice: VoiceSettings,
  ctx: NarrativeContext = {},
): Promise<{
  narrative: Narrative
  _meta: { promptTokens: number; completionTokens: number; promptVersion: string; rawOutput: string }
}> {
  const ai = getGeminiClient()
  const model = ai.getGenerativeModel({
    model: MODEL,
    generationConfig: { maxOutputTokens: 4096, responseMimeType: 'application/json' },
  })
  const prompt = buildNarrativePrompt(loadPrompt(), summaries, voice, ctx)

  const result = await aiCircuitBreaker.call(() => model.generateContent(prompt))

  const finishReason = result.response.candidates?.[0]?.finishReason
  if (finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini narrative response truncated at maxOutputTokens')
  }

  const rawOutput = result.response.text()
  const usage = result.response.usageMetadata
  const narrative = normalizeNarrative(parseJsonObject(rawOutput))

  return {
    narrative,
    _meta: {
      promptTokens: usage?.promptTokenCount ?? 0,
      completionTokens: usage?.candidatesTokenCount ?? 0,
      promptVersion: PROMPT_VERSION,
      rawOutput,
    },
  }
}
