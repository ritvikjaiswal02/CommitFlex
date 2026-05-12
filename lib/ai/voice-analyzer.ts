import { readFileSync } from 'fs'
import { join } from 'path'
import { getGeminiClient, aiCircuitBreaker } from './provider'

const PROMPT_VERSION = '1.0'
const MODEL = 'gemini-2.5-flash'
const FINGERPRINT_PREFIX = 'Voice fingerprint:'

function loadPrompt(): string {
  return readFileSync(join(process.cwd(), 'lib/ai/prompts/voice-analyze.md'), 'utf8')
}

function formatSamples(samples: string[]): string {
  return samples
    .map((s, i) => `--- Sample ${i + 1} ---\n${s.trim()}`)
    .join('\n\n')
}

/**
 * Trim Gemini output to a single voice-fingerprint paragraph. The model is
 * instructed to start with the marker prefix, but we defensively normalise:
 * - strip surrounding code fences / blockquote markers
 * - if the prefix is missing, prepend it
 * - collapse internal whitespace runs
 */
export function normaliseFingerprint(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^```(?:[a-z]+)?\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/^>\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.toLowerCase().startsWith(FINGERPRINT_PREFIX.toLowerCase())) return cleaned
  return `${FINGERPRINT_PREFIX} ${cleaned}`
}

export async function analyzeVoiceSamples(samples: string[]): Promise<{
  fingerprint: string
  _meta: { promptTokens: number; completionTokens: number; promptVersion: string; rawOutput: string }
}> {
  if (samples.length === 0) throw new Error('At least one sample is required')

  const ai = getGeminiClient()
  const model = ai.getGenerativeModel({
    model: MODEL,
    generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
  })
  const prompt = loadPrompt().replace('{{samples}}', formatSamples(samples))

  const result = await aiCircuitBreaker.call(() => model.generateContent(prompt))

  const finishReason = result.response.candidates?.[0]?.finishReason
  if (finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini voice-analyzer response truncated at maxOutputTokens')
  }

  const rawOutput = result.response.text()
  const usage = result.response.usageMetadata

  return {
    fingerprint: normaliseFingerprint(rawOutput),
    _meta: {
      promptTokens: usage?.promptTokenCount ?? 0,
      completionTokens: usage?.candidatesTokenCount ?? 0,
      promptVersion: PROMPT_VERSION,
      rawOutput,
    },
  }
}
