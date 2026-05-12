import { readFileSync } from 'fs'
import { join } from 'path'
import { getGeminiClient, aiCircuitBreaker } from './provider'
import { normalizeGeneratedPost } from './normalize'
import type { Narrative, GeneratedPost } from '@/types/ai'
import type { VoiceSettings } from '@/types/jobs'

const PROMPT_VERSION = '1.1'
const MODEL = 'gemini-2.5-flash'
const DEFAULT_TEMPERATURE = 0.7

export interface ToneOverrides {
  technical: number   // 0..100 — lower = simpler analogies, higher = jargon-dense
  engagement: number  // 0..100 — lower = matter-of-fact, higher = punchy/emoji/CTAs
  creativity: number  // 0..100 — lower = literal, higher = inventive / unexpected angle
}

export interface GenerateOptions {
  /** 0..1 (Gemini); when omitted, derived from creativity or defaults to 0.7. */
  temperature?: number
  toneOverrides?: ToneOverrides
}

/**
 * Map 0..100 creativity dial into a Gemini temperature 0.3..1.0.
 * Linear mapping; exported so the API layer can also surface the chosen value.
 */
export function creativityToTemperature(creativity: number): number {
  const clamped = Math.max(0, Math.min(100, creativity))
  return 0.3 + (clamped / 100) * 0.7
}

function bandDescriptor(value: number, lo: string, mid: string, hi: string): string {
  if (value <= 33) return lo
  if (value <= 66) return mid
  return hi
}

function buildToneOverridesBlock(o?: ToneOverrides): string {
  if (!o) return ''
  const tech = bandDescriptor(
    o.technical,
    'minimal jargon, use plain-English analogies',
    'balanced — light jargon explained where it lands',
    'dense technical depth, named patterns and benchmarks welcome',
  )
  const eng = bandDescriptor(
    o.engagement,
    'matter-of-fact, no hype words or emoji',
    'lightly engaging, one tasteful question or sharp opener',
    'punchy and energetic, hook first, optional emoji, end on a CTA',
  )
  const cre = bandDescriptor(
    o.creativity,
    'literal phrasing; describe what happened',
    'allow one fresh angle or comparison',
    'find an unexpected angle; reach for metaphor when it sharpens the point',
  )
  return [
    'Tone dials (override the defaults above if they conflict):',
    `- Technical: ${tech}`,
    `- Engagement: ${eng}`,
    `- Creativity: ${cre}`,
  ].join('\n')
}

function buildExtraContextBlock(extraContext?: string): string {
  const trimmed = extraContext?.trim()
  if (!trimmed) return ''
  return ['Author voice fingerprint — match this:', trimmed].join('\n')
}

function loadPrompt(platform: 'linkedin' | 'twitter'): string {
  return readFileSync(join(process.cwd(), `lib/ai/prompts/${platform}.md`), 'utf8')
}

function buildPrompt(
  platform: 'linkedin' | 'twitter',
  narrative: Narrative,
  voice: VoiceSettings,
  options: GenerateOptions = {},
): string {
  const narrativeText = `Theme: ${narrative.theme}\n\nStory: ${narrative.story}\n\nKey points:\n${narrative.keyPoints.map(p => `- ${p}`).join('\n')}`
  return loadPrompt(platform)
    .replace('{{tone}}', voice.tone)
    .replace('{{technicalLevel}}', String(voice.technicalLevel))
    .replace('{{audience}}', voice.audience)
    .replace('{{narrative}}', narrativeText)
    .replace('{{extraContext}}', buildExtraContextBlock(voice.extraContext))
    .replace('{{toneOverrides}}', buildToneOverridesBlock(options.toneOverrides))
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

export async function generatePost(
  platform: 'linkedin' | 'twitter',
  narrative: Narrative,
  voice: VoiceSettings,
  options: GenerateOptions = {},
): Promise<{
  post: GeneratedPost
  _meta: { promptTokens: number; completionTokens: number; promptVersion: string; rawOutput: string; temperature: number }
}> {
  const temperature =
    options.temperature ??
    (options.toneOverrides ? creativityToTemperature(options.toneOverrides.creativity) : DEFAULT_TEMPERATURE)

  const ai = getGeminiClient()
  const model = ai.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      temperature,
    },
  })
  const prompt = buildPrompt(platform, narrative, voice, options)

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
      temperature,
    },
  }
}

export async function generatePosts(narrative: Narrative, voice: VoiceSettings): Promise<{
  linkedin: { post: GeneratedPost; _meta: { promptTokens: number; completionTokens: number; promptVersion: string; rawOutput: string; temperature: number } } | null
  twitter: { post: GeneratedPost; _meta: { promptTokens: number; completionTokens: number; promptVersion: string; rawOutput: string; temperature: number } } | null
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
