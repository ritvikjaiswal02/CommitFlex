import { db } from '@/lib/db/client'
import { pipelineEvents } from '@/lib/db/schema'
import type { PipelineEventType } from '@/types/jobs'
import { randomUUID } from 'crypto'

export async function emitEvent(
  jobId: string,
  type: PipelineEventType,
  metadata?: Record<string, unknown>,
) {
  await db.insert(pipelineEvents).values({
    jobId,
    correlationId: randomUUID(),
    type,
    metadata,
  })
}
