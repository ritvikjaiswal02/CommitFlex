import { describe, it, expect } from 'vitest'
import {
  CADENCE_DAYS,
  CADENCE_OPTIONS,
  ROLE_OPTIONS,
  TONE_OPTIONS,
  TONE_TO_VOICE,
  audienceSummary,
  checkVoiceSamples,
  isValidTimeZone,
  splitVoiceSamples,
} from '@/components/onboarding/questions'
import { OnboardingCompleteSchema, OnboardingPatchSchema, VoiceAnalyzeSchema } from '@/components/onboarding/schemas'
import { coerceAutopilotChoices } from '@/app/api/onboarding/_shared'

const post = (n = 60) => 'x'.repeat(n)

describe('onboarding copy', () => {
  it('has the six roles and five tones from the spec', () => {
    expect(ROLE_OPTIONS.map((o) => o.value)).toEqual(['founder', 'engineer', 'maintainer', 'freelancer', 'student', 'devrel'])
    expect(TONE_OPTIONS.map((o) => o.value)).toEqual([
      'plain_technical',
      'story_led',
      'confident_founder',
      'teacher',
      'casual',
    ])
    for (const o of TONE_OPTIONS) expect(o.example.length).toBeGreaterThan(60)
  })

  it('maps tones to the voice the generator reads', () => {
    expect(TONE_TO_VOICE.plain_technical).toEqual({ tone: 'analytical', technicalLevel: 8 })
    expect(TONE_TO_VOICE.story_led).toEqual({ tone: 'storytelling', technicalLevel: 6 })
    expect(TONE_TO_VOICE.confident_founder).toEqual({ tone: 'enthusiastic', technicalLevel: 5 })
    expect(TONE_TO_VOICE.teacher).toEqual({ tone: 'educational', technicalLevel: 6 })
    expect(TONE_TO_VOICE.casual).toEqual({ tone: 'casual', technicalLevel: 5 })
  })

  it('has posting days for every cadence', () => {
    for (const o of CADENCE_OPTIONS) expect(CADENCE_DAYS[o.value].length).toBeGreaterThan(0)
    expect(CADENCE_DAYS.twice_weekly).toEqual([2, 4])
    expect(CADENCE_DAYS.three_weekly).toEqual([1, 3, 5])
  })
})

describe('voice samples', () => {
  it('splits on blank lines and trims', () => {
    expect(splitVoiceSamples('one\nstill one\n\n\n  two  \r\n\r\nthree')).toEqual(['one\nstill one', 'two', 'three'])
    expect(splitVoiceSamples('   \n\n  ')).toEqual([])
  })

  it('flags short, long and too many samples', () => {
    expect(checkVoiceSamples('').valid).toBe(true)
    expect(checkVoiceSamples(`${post()}\n\n${post()}`).valid).toBe(true)
    expect(checkVoiceSamples(`${post()}\n\nshort`).tooShort).toBe(1)
    expect(checkVoiceSamples(post(5001)).tooLong).toBe(1)
    expect(checkVoiceSamples(Array.from({ length: 11 }, () => post()).join('\n\n')).tooMany).toBe(true)
  })
})

describe('helpers', () => {
  it('summarises audiences', () => {
    expect(audienceSummary([])).toBe('developers')
    expect(audienceSummary(['recruiters'])).toBe('recruiters')
    expect(audienceSummary(['developers', 'customers'])).toBe('developers and customers')
  })

  it('validates time zones', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone(42)).toBe(false)
  })

  it('downgrades autopilot choices the plan lacks', () => {
    expect(coerceAutopilotChoices('free', { cadence: 'weekly', approvalMode: 'auto' })).toEqual({
      cadence: 'ship_moments',
      approvalMode: 'review',
      downgraded: ['cadence', 'approvalMode'],
    })
    expect(coerceAutopilotChoices('pro', { cadence: 'weekly', approvalMode: 'auto' })).toEqual({
      cadence: 'weekly',
      approvalMode: 'auto',
      downgraded: [],
    })
    expect(coerceAutopilotChoices('free', { cadence: 'ship_moments' }).downgraded).toEqual([])
  })
})

describe('schemas', () => {
  const complete = {
    role: 'founder',
    audiences: ['developers'],
    platforms: ['linkedin'],
    tonePreset: 'casual',
    cadence: 'weekly',
    postTime: '09:00',
    approvalMode: 'review',
    timezone: 'Asia/Kolkata',
  }

  it('accepts a complete answer set and defaults samples to []', () => {
    const parsed = OnboardingCompleteSchema.parse(complete)
    expect(parsed.voiceSamples).toEqual([])
  })

  it('rejects missing audiences, three audiences and bad zones', () => {
    expect(OnboardingCompleteSchema.safeParse({ ...complete, audiences: [] }).success).toBe(false)
    expect(
      OnboardingCompleteSchema.safeParse({ ...complete, audiences: ['developers', 'users', 'founders'] }).success,
    ).toBe(false)
    expect(OnboardingCompleteSchema.safeParse({ ...complete, timezone: 'Nowhere/City' }).success).toBe(false)
    expect(OnboardingCompleteSchema.safeParse({ ...complete, postTime: '07:00' }).success).toBe(false)
  })

  it('rejects unknown keys on PATCH', () => {
    expect(OnboardingPatchSchema.safeParse({ step: 'role' }).success).toBe(true)
    expect(OnboardingPatchSchema.safeParse({ onboardedAt: '2026-01-01' }).success).toBe(false)
  })

  it('accepts one sample for analysis but not a short one', () => {
    expect(VoiceAnalyzeSchema.safeParse({ samples: [post()] }).success).toBe(true)
    expect(VoiceAnalyzeSchema.safeParse({ samples: [] }).success).toBe(false)
    expect(VoiceAnalyzeSchema.safeParse({ samples: ['too short'] }).success).toBe(false)
  })
})
