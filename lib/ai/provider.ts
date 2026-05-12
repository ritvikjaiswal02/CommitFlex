import { GoogleGenerativeAI } from '@google/generative-ai'

let _client: GoogleGenerativeAI | null = null

export function getGeminiClient(): GoogleGenerativeAI {
  if (!_client) {
    _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  }
  return _client
}

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
