import { GoogleGenerativeAI } from '@google/generative-ai'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Text generation for the pipeline, with a provider fallback.
 *
 * Callers use a small Gemini-shaped surface (`getGenerativeModel(...)
 * .generateContent(prompt)` returning `{ response: { text(), candidates,
 * usageMetadata } }`). Behind it, requests go to the primary provider
 * (AI_PROVIDER, default "gemini") and, when that call throws and the other
 * provider is configured, are retried once on the other one. Anthropic
 * responses are mapped into the same shape, so callers don't branch.
 */

export type AIProviderName = 'gemini' | 'anthropic'

export interface GenerationConfig {
  maxOutputTokens?: number
  /** 'application/json' asks for a bare JSON value. */
  responseMimeType?: string
  /** Gemini only; Anthropic's current models pick their own sampling. */
  temperature?: number
}

export interface GenerateContentResult {
  response: {
    text(): string
    candidates?: { finishReason?: string }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
  }
}

export interface TextModel {
  generateContent(prompt: string): Promise<GenerateContentResult>
}

export interface TextModelClient {
  getGenerativeModel(options: { model: string; generationConfig?: GenerationConfig }): TextModel
}

/** Claude model used when Anthropic serves a request. Override with ANTHROPIC_MODEL. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5'

const JSON_INSTRUCTION =
  'Respond with only the JSON value the prompt asks for: no Markdown code fences, no commentary before or after it.'

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

/** Providers to try, in order: the primary first, then any configured fallback. */
export function providerOrder(): AIProviderName[] {
  const primary: AIProviderName = envValue('AI_PROVIDER')?.toLowerCase() === 'anthropic' ? 'anthropic' : 'gemini'
  const order: AIProviderName[] = primary === 'anthropic' ? ['anthropic', 'gemini'] : ['gemini', 'anthropic']
  const configured = order.filter((p) => (p === 'gemini' ? !!envValue('GEMINI_API_KEY') : !!envValue('ANTHROPIC_API_KEY')))
  // With nothing configured, keep the primary so the error says what is missing.
  return configured.length > 0 ? configured : [primary]
}

let _gemini: GoogleGenerativeAI | null = null
function gemini(): GoogleGenerativeAI {
  if (!_gemini) _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')
  return _gemini
}

let _anthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: envValue('ANTHROPIC_API_KEY') })
  return _anthropic
}

/** Removes a ```json fence if a model adds one despite the instruction. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const match = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(trimmed)
  return match ? match[1].trim() : trimmed
}

async function generateWithAnthropic(prompt: string, config: GenerationConfig): Promise<GenerateContentResult> {
  const wantsJson = config.responseMimeType === 'application/json'
  // Thinking shares max_tokens with the answer, so leave headroom above the
  // caller's output budget. Streaming keeps long requests clear of HTTP timeouts.
  const maxTokens = Math.min(64_000, Math.max(16_000, (config.maxOutputTokens ?? 4096) + 8_000))
  const message = await anthropic()
    .messages.stream({
      model: envValue('ANTHROPIC_MODEL') ?? DEFAULT_ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      output_config: { effort: 'medium' },
      ...(wantsJson ? { system: JSON_INSTRUCTION } : {}),
      messages: [{ role: 'user', content: prompt }],
    })
    .finalMessage()

  const stopReason = String(message.stop_reason ?? '')
  if (stopReason === 'refusal') throw new Error('Anthropic declined the request (stop_reason: refusal)')

  const raw = message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
  const text = wantsJson ? stripCodeFence(raw) : raw.trim()

  return {
    response: {
      text: () => text,
      candidates: [{ finishReason: stopReason === 'max_tokens' ? 'MAX_TOKENS' : 'STOP' }],
      usageMetadata: {
        promptTokenCount: message.usage.input_tokens,
        candidatesTokenCount: message.usage.output_tokens,
        totalTokenCount: message.usage.input_tokens + message.usage.output_tokens,
      },
    },
  }
}

async function generateWithGemini(model: string, prompt: string, config: GenerationConfig): Promise<GenerateContentResult> {
  return gemini().getGenerativeModel({ model, generationConfig: config }).generateContent(prompt)
}

/** The pipeline's AI client: primary provider with a one-step fallback. */
export function getAIClient(): TextModelClient {
  return {
    getGenerativeModel({ model, generationConfig = {} }) {
      return {
        async generateContent(prompt: string) {
          const order = providerOrder()
          let lastError: unknown
          for (let i = 0; i < order.length; i++) {
            const provider = order[i]
            try {
              return provider === 'anthropic'
                ? await generateWithAnthropic(prompt, generationConfig)
                : await generateWithGemini(model, prompt, generationConfig)
            } catch (err) {
              lastError = err
              if (i < order.length - 1) {
                console.warn(`[ai] ${provider} failed, falling back to ${order[i + 1]}:`, err instanceof Error ? err.message : err)
              }
            }
          }
          throw lastError
        },
      }
    },
  }
}

/** Kept for existing callers; routes through {@link getAIClient}. */
export const getGeminiClient = getAIClient

export interface CircuitBreakerConfig {
  threshold: number
  windowMs: number
  cooldownMs: number
  minSamples: number
}

type CircuitState = 'closed' | 'open' | 'half-open'

interface Window {
  calls: number
  failures: number
  openedAt: number | null
}

export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private window: Window = { calls: 0, failures: 0, openedAt: null }
  private windowStart = Date.now()

  constructor(private config: CircuitBreakerConfig) {}

  private resetWindow() {
    this.window = { calls: 0, failures: 0, openedAt: null }
    this.windowStart = Date.now()
  }

  private checkWindowExpiry() {
    if (Date.now() - this.windowStart > this.config.windowMs) {
      this.resetWindow()
    }
  }

  isOpen(): boolean {
    if (this.state !== 'open') return false
    const elapsed = Date.now() - (this.window.openedAt ?? 0)
    if (elapsed >= this.config.cooldownMs) {
      this.state = 'half-open'
      return false
    }
    return true
  }

  private checkThreshold() {
    if (this.window.calls >= this.config.minSamples) {
      const rate = this.window.failures / this.window.calls
      if (rate >= this.config.threshold) {
        this.state = 'open'
        this.window.openedAt = Date.now()
      }
    }
  }

  recordSuccess() {
    this.checkWindowExpiry()
    this.window.calls++
    if (this.state === 'half-open') {
      this.state = 'closed'
      this.resetWindow()
      return
    }
    this.checkThreshold()
  }

  recordFailure() {
    this.checkWindowExpiry()
    this.window.calls++
    this.window.failures++
    if (this.state === 'half-open') {
      this.state = 'open'
      this.window.openedAt = Date.now()
      return
    }
    this.checkThreshold()
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is open — AI provider unavailable')
    }
    try {
      const result = await fn()
      this.recordSuccess()
      return result
    } catch (err) {
      this.recordFailure()
      throw err
    }
  }
}

export const aiCircuitBreaker = new CircuitBreaker({
  threshold: 0.5,
  windowMs: 300_000,
  cooldownMs: 120_000,
  minSamples: 4,
})
