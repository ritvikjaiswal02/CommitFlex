import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const geminiGenerate = vi.fn()
const anthropicStream = vi.fn()

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: geminiGenerate }
    }
  },
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { stream: anthropicStream }
  },
}))

import { getAIClient, providerOrder, stripCodeFence, DEFAULT_ANTHROPIC_MODEL } from '@/lib/ai/provider'

const ENV_KEYS = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'AI_PROVIDER', 'ANTHROPIC_MODEL'] as const
const saved: Record<string, string | undefined> = {}

function claudeMessage(text: string, stop_reason = 'end_turn') {
  return {
    finalMessage: () =>
      Promise.resolve({
        content: [{ type: 'text', text }],
        stop_reason,
        usage: { input_tokens: 12, output_tokens: 34 },
      }),
  }
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  geminiGenerate.mockReset()
  anthropicStream.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.restoreAllMocks()
})

describe('providerOrder', () => {
  it('defaults to Gemini and only lists configured providers', () => {
    process.env.GEMINI_API_KEY = 'g'
    expect(providerOrder()).toEqual(['gemini'])
    process.env.ANTHROPIC_API_KEY = 'a'
    expect(providerOrder()).toEqual(['gemini', 'anthropic'])
  })

  it('puts Anthropic first when AI_PROVIDER=anthropic', () => {
    process.env.GEMINI_API_KEY = 'g'
    process.env.ANTHROPIC_API_KEY = 'a'
    process.env.AI_PROVIDER = 'anthropic'
    expect(providerOrder()).toEqual(['anthropic', 'gemini'])
  })

  it('keeps the primary when nothing is configured', () => {
    expect(providerOrder()).toEqual(['gemini'])
  })
})

describe('stripCodeFence', () => {
  it('removes a json fence and leaves bare JSON alone', () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(stripCodeFence('  {"a":1} ')).toBe('{"a":1}')
  })
})

describe('getAIClient', () => {
  const model = () =>
    getAIClient().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { maxOutputTokens: 2048, responseMimeType: 'application/json' },
    })

  it('returns the Gemini result when Gemini succeeds', async () => {
    process.env.GEMINI_API_KEY = 'g'
    process.env.ANTHROPIC_API_KEY = 'a'
    const result = { response: { text: () => '{"ok":true}' } }
    geminiGenerate.mockResolvedValue(result)
    await expect(model().generateContent('hi')).resolves.toBe(result)
    expect(anthropicStream).not.toHaveBeenCalled()
  })

  it('falls back to Claude when Gemini throws and maps the response', async () => {
    process.env.GEMINI_API_KEY = 'g'
    process.env.ANTHROPIC_API_KEY = 'a'
    geminiGenerate.mockRejectedValue(new Error('503 overloaded'))
    anthropicStream.mockReturnValue(claudeMessage('```json\n{"ok":true}\n```'))

    const res = await model().generateContent('hi')
    expect(res.response.text()).toBe('{"ok":true}')
    expect(res.response.candidates?.[0]?.finishReason).toBe('STOP')
    expect(res.response.usageMetadata).toMatchObject({ promptTokenCount: 12, candidatesTokenCount: 34 })

    const params = anthropicStream.mock.calls[0][0]
    expect(params.model).toBe(DEFAULT_ANTHROPIC_MODEL)
    expect(params.max_tokens).toBeGreaterThanOrEqual(16000)
    expect(params.system).toMatch(/JSON/)
    expect(params).not.toHaveProperty('temperature')
  })

  it('reports MAX_TOKENS and throws on refusal', async () => {
    process.env.ANTHROPIC_API_KEY = 'a'
    process.env.AI_PROVIDER = 'anthropic'
    anthropicStream.mockReturnValueOnce(claudeMessage('{"partial', 'max_tokens'))
    const res = await model().generateContent('hi')
    expect(res.response.candidates?.[0]?.finishReason).toBe('MAX_TOKENS')

    anthropicStream.mockReturnValueOnce(claudeMessage('', 'refusal'))
    await expect(model().generateContent('hi')).rejects.toThrow(/refusal/)
  })

  it('throws the last error when every provider fails', async () => {
    process.env.GEMINI_API_KEY = 'g'
    process.env.ANTHROPIC_API_KEY = 'a'
    geminiGenerate.mockRejectedValue(new Error('gemini down'))
    anthropicStream.mockImplementation(() => {
      throw new Error('claude down')
    })
    await expect(model().generateContent('hi')).rejects.toThrow('claude down')
  })
})
