'use client'

import * as React from 'react'
import {
  PAGE_SOURCE,
  isExtensionMessage,
  type ExtensionMessage,
  type ExtensionStatus,
  type PageMessage,
} from './bridge-protocol'

export type BridgeState =
  | { phase: 'detecting' }
  | { phase: 'missing' }
  | ({ phase: 'present' } & ExtensionStatus)

/** How long to wait for the bridge to answer the first ping before showing install steps. */
const DETECT_TIMEOUT_MS = 1500
/** Connect verifies the token against the API, so give it time. */
const REQUEST_TIMEOUT_MS = 12_000

type Pending = {
  resolve: (msg: ExtensionMessage) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Distributes Omit over a union so each page message keeps its own fields. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type PageRequest = DistributiveOmit<PageMessage, 'source' | 'id'>

/**
 * Talks to the CommitFlex extension through its bridge content script, which
 * runs on this origin. Detects whether the extension is installed, and sends
 * connect and disconnect requests that resolve with the extension's answer.
 */
export function useExtensionBridge() {
  const [state, setState] = React.useState<BridgeState>({ phase: 'detecting' })
  const pending = React.useRef(new Map<string, Pending>())

  React.useEffect(() => {
    const requests = pending.current

    function onMessage(event: MessageEvent) {
      // Only the bridge content script on this exact page may answer.
      if (event.source !== window || event.origin !== window.location.origin) return
      const data = event.data
      if (!isExtensionMessage(data)) return

      if (data.type !== 'error') {
        const { version, connected, account, tokenPrefix, appUrl } = data
        setState({ phase: 'present', version, connected, account, tokenPrefix, appUrl })
      }

      if (data.id && requests.has(data.id)) {
        const entry = requests.get(data.id)!
        clearTimeout(entry.timer)
        requests.delete(data.id)
        if (data.type === 'error') entry.reject(new Error(data.error))
        else entry.resolve(data)
      }
    }

    window.addEventListener('message', onMessage)
    const ping: PageMessage = { source: PAGE_SOURCE, id: newId(), type: 'ping' }
    window.postMessage(ping, window.location.origin)

    const detectTimer = setTimeout(() => {
      setState((current) => (current.phase === 'detecting' ? { phase: 'missing' } : current))
    }, DETECT_TIMEOUT_MS)

    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(detectTimer)
      requests.forEach((entry) => {
        clearTimeout(entry.timer)
        entry.reject(new Error('The page was closed before the extension answered.'))
      })
      requests.clear()
    }
  }, [])

  const request = React.useCallback((message: PageRequest): Promise<ExtensionMessage> => {
    const id = newId()
    return new Promise<ExtensionMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.current.delete(id)
        reject(new Error('The extension did not answer. Reload this page and try again.'))
      }, REQUEST_TIMEOUT_MS)
      pending.current.set(id, { resolve, reject, timer })
      window.postMessage({ ...message, source: PAGE_SOURCE, id } as PageMessage, window.location.origin)
    })
  }, [])

  const connect = React.useCallback(
    (token: string, appUrl: string) => request({ type: 'connect', token, appUrl }),
    [request],
  )
  const disconnect = React.useCallback(() => request({ type: 'disconnect' }), [request])
  const recheck = React.useCallback(() => request({ type: 'ping' }), [request])

  return { state, connect, disconnect, recheck }
}
