import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import * as schema from '@/lib/db/schema'

describe('autopilot and billing schema', () => {
  it('exports every new table', () => {
    for (const name of [
      'userProfiles', 'autopilotSettings', 'queueItems', 'approvalTokens', 'shipEvents',
      'socialConnections', 'publishLog', 'subscriptions', 'billingEvents', 'usageCounters', 'apiTokens',
    ] as const) {
      expect(schema[name], name).toBeDefined()
    }
  })

  it('adds the new columns to existing tables', () => {
    const cols = (t: Parameters<typeof getTableConfig>[0]) => getTableConfig(t).columns.map((c) => c.name)
    expect(cols(schema.repos)).toEqual(expect.arrayContaining(['autopilot_enabled', 'webhook_events']))
    expect(cols(schema.generationJobs)).toEqual(expect.arrayContaining(['trigger', 'voice_profile_id', 'auto_queue']))
    expect(cols(schema.userNotificationPreferences)).toEqual(
      expect.arrayContaining(['approval_requests', 'ready_to_post', 'publish_receipts']),
    )
  })

  it('declares the unique indexes the idempotency logic relies on', () => {
    const uniques = (t: Parameters<typeof getTableConfig>[0]) =>
      getTableConfig(t).indexes.filter((i) => i.config.unique).map((i) => i.config.name)
    expect(uniques(schema.queueItems)).toContain('queue_items_draft_uidx')
    expect(uniques(schema.shipEvents)).toContain('ship_events_dedupe_uidx')
    expect(uniques(schema.billingEvents)).toContain('billing_events_event_uidx')
    expect(uniques(schema.subscriptions)).toContain('subscriptions_rzp_sub_uidx')
    expect(uniques(schema.apiTokens)).toContain('api_tokens_hash_uidx')
    expect(uniques(schema.approvalTokens)).toContain('approval_tokens_hash_uidx')
    expect(uniques(schema.socialConnections)).toContain('social_connections_user_provider_uidx')
    expect(getTableConfig(schema.usageCounters).primaryKeys[0].columns.map((c) => c.name)).toEqual(['user_id', 'period', 'metric'])
  })
})
