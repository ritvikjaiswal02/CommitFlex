import { describe, it, expect } from 'vitest'

describe('schema exports', () => {
  it('exports all application tables', async () => {
    const schema = await import('@/lib/db/schema')
    expect(schema.users).toBeDefined()
    expect(schema.accounts).toBeDefined()
    expect(schema.sessions).toBeDefined()
    expect(schema.verificationTokens).toBeDefined()
    expect(schema.repos).toBeDefined()
    expect(schema.voiceSettings).toBeDefined()
    expect(schema.generationJobs).toBeDefined()
    expect(schema.commitSnapshots).toBeDefined()
    expect(schema.commitSummaries).toBeDefined()
    expect(schema.extractedNarratives).toBeDefined()
    expect(schema.postDrafts).toBeDefined()
    expect(schema.aiGenerationLogs).toBeDefined()
    expect(schema.pipelineEvents).toBeDefined()
  })
})
