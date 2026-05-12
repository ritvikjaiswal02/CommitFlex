import { readFileSync } from 'fs'
import { join } from 'path'
import { getGeminiClient, aiCircuitBreaker } from './provider'
import { normalizeGeneratedPost } from './normalize'
import type { Narrative, GeneratedPost } from '@/types/ai'
import type { VoiceSettings } from '@/types/jobs'

const PROMPT_VERSION = '1.0'
const MODEL = 'gemini-2.5-flash'

function loadPrompt(platform: 'linkedin' | 'twitter'): string {
  return readFileSync(join(process.cwd(), `lib/ai/prompts/${platform}.md`), 'utf8')
}

function buildPrompt(platform: 'linkedin' | 'twitter', narrative: Narrative, voice: VoiceSettings): string {
  const narrativeText = `Theme: ${narrative.theme}\n\nStory: ${narrative.story}\n\nKey points:\n${narrative.keyPoints.map(p => `- ${p}`).join('\n')}`
  return loadPrompt(platform)
    .replace('{{tone}}', voice.tone)
    .replace('{{technicalLevel}}', String(voice.technicalLevel))
    .replace('{{audience}}', voice.audience)
    .replace('{{narrative}}', narrativeText)
}

function parseJsonObject(text: string, platform: string): unknown {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch {}
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(stripped) } catch {}
  const match = stripped.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`No JSON object found in ${platform} post response`)
  return JSON.parse(match[0])
}

export async function generatePost(platform: 'linkedin' | 'twitter', narrative: Narrative, voice: VoiceSettings): Promise<{
  post: GeneratedPost
  _meta: { promptTokens: number; completionTokens: number; promptVersion: string; rawOutput: string }
}> {
  const ai = getGeminiClient()
  const model = ai.getGenerativeModel({
    model: MODEL,
    generationConfig: { maxOutputTokens: 2048, responseMimeType: 'application/json' },
  })
  const prompt = buildPrompt(platform, narrative, voice)

  const result = await aiCircuitBreaker.call(() => model.generateContent(prompt))

  const finishReason = result.response.candidates?.[0]?.finishReason
  if (finishReason === 'MAX_TOKENS') {
    throw new Error(`Gemini ${platform} post truncated at maxOutputTokens`)
  }

  const rawOutput = result.response.text()
  const usage = result.response.usageMetadata
  const post = normalizeGeneratedPost(parseJsonObject(rawOutput, platform), platform)

  return {
    post,
    _meta: {
      promptTokens: usage?.promptTokenCount ?? 0,
      completionTokens: usage?.candidatesTokenCount ?? 0,
      promptVersion: PROMPT_VERSION,
      rawOutput,
    },
  }
}

export async function generatePosts(narrative: Narrative, voice: VoiceSettings): Promise<{
  linkedin: { post: GeneratedPost; _meta: { promptTokens: number; completionTokens: number; promptVersion: string; rawOutput: string } } | null
  twitter: { post: GeneratedPost; _meta: { promptTokens: number; completionTokens: number; promptVersion: string; rawOutput: string } } | null
  errors: { linkedin?: string; twitter?: string }
}> {
  const [linkedinResult, twitterResult] = await Promise.allSettled([
    generatePost('linkedin', narrative, voice),
    generatePost('twitter', narrative, voice),
  ])

  return {
    linkedin: linkedinResult.status === 'fulfilled' ? linkedinResult.value : null,
    twitter: twitterResult.status === 'fulfilled' ? twitterResult.value : null,
    errors: {
      ...(linkedinResult.status === 'rejected' ? { linkedin: linkedinResult.reason?.message } : {}),
      ...(twitterResult.status === 'rejected' ? { twitter: twitterResult.reason?.message } : {}),
    },
  }
}
