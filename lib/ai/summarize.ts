import { readFileSync } from 'fs'
import { join } from 'path'
import { getGeminiClient, aiCircuitBreaker } from './provider'
import { normalizeCommitSummary } from './normalize'
import type { RawCommit } from '@/types/github'
import type { CommitSummary } from '@/types/ai'

const PROMPT_VERSION = '1.0'
const MODEL = 'gemini-2.5-flash'

function loadPrompt(): string {
  return readFileSync(join(process.cwd(), 'lib/ai/prompts/summarize.md'), 'utf8')
}

function buildPrompt(commits: RawCommit[]): string {
  const commitsText = commits
    .map(c => `SHA: ${c.sha}\nAuthor: ${c.author}\nDate: ${c.date}\nMessage: ${c.message}`)
    .join('\n\n')
  return loadPrompt().replace('{{commits}}', commitsText)
}

function parseResponse(text: string): unknown[] {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch {}
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(stripped) } catch {}
  const match = stripped.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON array found in AI response')
  return JSON.parse(match[0])
}

export async function summarizeCommits(commits: RawCommit[]): Promise<{
  summaries: CommitSummary[]
  _meta: { promptTokens: number; completionTokens: number; promptVersion: string; rawOutput: string }
}> {
  if (commits.length === 0) return {
    summaries: [],
    _meta: { promptTokens: 0, completionTokens: 0, promptVersion: PROMPT_VERSION, rawOutput: '' },
  }

  const ai = getGeminiClient()
  const model = ai.getGenerativeModel({
    model: MODEL,
    generationConfig: { maxOutputTokens: 16384, responseMimeType: 'application/json' },
  })
  const prompt = buildPrompt(commits)

  const result = await aiCircuitBreaker.call(() => model.generateContent(prompt))

  const finishReason = result.response.candidates?.[0]?.finishReason
  if (finishReason === 'MAX_TOKENS') {
    throw new Error(`Gemini response truncated at maxOutputTokens (${commits.length} commits). Increase the limit or chunk the input.`)
  }

  const rawOutput = result.response.text()
  const usage = result.response.usageMetadata
  const parsed = parseResponse(rawOutput)
  const summaries = parsed.map(normalizeCommitSummary)

  return {
    summaries,
    _meta: {
      promptTokens: usage?.promptTokenCount ?? 0,
      completionTokens: usage?.candidatesTokenCount ?? 0,
      promptVersion: PROMPT_VERSION,
      rawOutput,
    },
  }
}
