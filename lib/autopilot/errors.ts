import { planErrorToResponse } from '@/lib/plans'

/** Expected failures of queue actions. Routes turn them into JSON responses. */
export class QueueError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'QueueError'
  }
}

export function isQueueError(err: unknown): err is QueueError {
  return (
    err instanceof QueueError ||
    (!!err &&
      typeof err === 'object' &&
      (err as { name?: unknown }).name === 'QueueError' &&
      typeof (err as { status?: unknown }).status === 'number')
  )
}

/** QueueError → its status; PlanError → 402; anything else → null. */
export function queueErrorToResponse(err: unknown): Response | null {
  if (isQueueError(err)) {
    return Response.json({ error: err.message, code: err.code, ...(err.extra ?? {}) }, { status: err.status })
  }
  return planErrorToResponse(err)
}
