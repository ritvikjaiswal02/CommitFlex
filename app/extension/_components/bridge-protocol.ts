/**
 * The window.postMessage protocol between the /extension page and the
 * extension's bridge content script (extension/src/content/bridge.ts).
 * Keep the two in sync: same sources, same message types.
 *
 *   page → extension   { source: 'commitflex-page', id, type: 'ping' | 'connect' | 'disconnect', … }
 *   extension → page   { source: 'commitflex-extension', id?, type: 'ready' | 'pong' | 'connected' | 'disconnected' | 'error', … }
 */
export const PAGE_SOURCE = 'commitflex-page'
export const EXTENSION_SOURCE = 'commitflex-extension'

export interface BridgeAccount {
  email: string | null
  name: string | null
}

export type PageMessage =
  | { source: typeof PAGE_SOURCE; id: string; type: 'ping' }
  | { source: typeof PAGE_SOURCE; id: string; type: 'connect'; token: string; appUrl: string }
  | { source: typeof PAGE_SOURCE; id: string; type: 'disconnect' }

export interface ExtensionStatus {
  version: string
  connected: boolean
  account: BridgeAccount | null
  /** Display prefix of the token the extension holds ('cfx_' + 8), so the page can revoke it on reconnect. */
  tokenPrefix: string | null
  /** The CommitFlex origin the extension talks to. */
  appUrl: string | null
}

export type ExtensionMessage =
  | ({ source: typeof EXTENSION_SOURCE; id?: string; type: 'ready' | 'pong' | 'connected' | 'disconnected' } & ExtensionStatus)
  | { source: typeof EXTENSION_SOURCE; id?: string; type: 'error'; error: string; code?: string }

export function isExtensionMessage(data: unknown): data is ExtensionMessage {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as { source?: unknown }).source === EXTENSION_SOURCE &&
    typeof (data as { type?: unknown }).type === 'string'
  )
}
