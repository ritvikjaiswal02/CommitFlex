/**
 * Bridge content script. Runs only on the CommitFlex app origin(s) and lets
 * the /extension page:
 *   - detect that the extension is installed (ping → pong),
 *   - hand over a freshly created token (connect → connected | error),
 *   - sign the extension out (disconnect → disconnected).
 * Protocol: app/extension/_components/bridge-protocol.ts.
 *
 * The page's origin, not anything in the message, decides which CommitFlex
 * instance the token is stored for.
 */
import { VERSION } from '../shared/config'
import { sendToBackground } from '../shared/messages'
import type { PublicState } from '../shared/types'

const PAGE_SOURCE = 'commitflex-page'
const EXTENSION_SOURCE = 'commitflex-extension'
const ORIGIN = window.location.origin

type PageMessage =
  | { source: typeof PAGE_SOURCE; id: string; type: 'ping' }
  | { source: typeof PAGE_SOURCE; id: string; type: 'connect'; token: string; appUrl?: string }
  | { source: typeof PAGE_SOURCE; id: string; type: 'disconnect' }

function isPageMessage(data: unknown): data is PageMessage {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as { source?: unknown }).source === PAGE_SOURCE &&
    typeof (data as { id?: unknown }).id === 'string' &&
    typeof (data as { type?: unknown }).type === 'string'
  )
}

function statusFrom(state: PublicState | null) {
  // Only report "connected" for this instance; a token for another origin
  // (say, localhost vs production) can't be used here.
  const sameOrigin = !!state && state.appUrl === ORIGIN
  return {
    version: VERSION,
    connected: !!state && state.connected && sameOrigin,
    account: state && sameOrigin && state.account ? { email: state.account.email, name: state.account.name } : null,
    tokenPrefix: state && sameOrigin ? state.tokenPrefix : null,
    appUrl: state?.appUrl ?? null,
  }
}

function post(message: Record<string, unknown>): void {
  window.postMessage({ source: EXTENSION_SOURCE, ...message }, ORIGIN)
}

async function currentStatus() {
  const result = await sendToBackground({ type: 'state:get' })
  return statusFrom(result.ok ? result.data : null)
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== ORIGIN) return
  const data = event.data
  if (!isPageMessage(data)) return

  void (async () => {
    switch (data.type) {
      case 'ping': {
        post({ id: data.id, type: 'pong', ...(await currentStatus()) })
        return
      }
      case 'connect': {
        if (typeof data.token !== 'string') {
          post({ id: data.id, type: 'error', error: 'No token was sent.', code: 'invalid_request' })
          return
        }
        const result = await sendToBackground({ type: 'auth:connect', token: data.token, appUrl: ORIGIN })
        if (result.ok) post({ id: data.id, type: 'connected', ...statusFrom(result.data) })
        else post({ id: data.id, type: 'error', error: result.error, code: result.code })
        return
      }
      case 'disconnect': {
        const result = await sendToBackground({ type: 'auth:disconnect' })
        if (result.ok) post({ id: data.id, type: 'disconnected', ...statusFrom(result.data) })
        else post({ id: data.id, type: 'error', error: result.error, code: result.code })
        return
      }
    }
  })()
})

document.documentElement.dataset.commitflexExtension = VERSION
void currentStatus().then((status) => post({ type: 'ready', ...status }))
