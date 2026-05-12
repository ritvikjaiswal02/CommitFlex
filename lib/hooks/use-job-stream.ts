'use client'

import { useEffect, useRef, useState } from 'react'

interface JobUpdate {
  status: string
  drafts: unknown[]
}

interface UseJobStreamOptions {
  jobId: string
  initialStatus: string
  onUpdate: (update: JobUpdate) => void
}

const TERMINAL = new Set(['completed', 'partial_completed', 'failed', 'cancelled'])

export function useJobStream({ jobId, initialStatus, onUpdate }: UseJobStreamOptions) {
  const esRef = useRef<EventSource | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (TERMINAL.has(initialStatus)) return

    const es = new EventSource(`/api/jobs/${jobId}/stream`)
    esRef.current = es

    es.addEventListener('open', () => setConnected(true))

    es.addEventListener('update', (e) => {
      const data = JSON.parse(e.data) as JobUpdate
      onUpdate(data)
      if (TERMINAL.has(data.status)) es.close()
    })

    es.addEventListener('error', () => {
      es.close()
      setConnected(false)
    })

    return () => {
      es.close()
      esRef.current = null
      setConnected(false)
    }
  }, [jobId, initialStatus, onUpdate])

  return { connected }
}
