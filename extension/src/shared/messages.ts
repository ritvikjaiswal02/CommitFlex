import type {
  DraftFromGithubResponse,
  ExtensionItem,
  JobResponse,
  Platform,
  PublicState,
  QueueResponse,
  Result,
  Settings,
} from './types'

/** Requests handled by the background service worker. */
export type BackgroundRequest =
  | { type: 'state:get' }
  | { type: 'auth:connect'; token: string; appUrl: string }
  | { type: 'auth:disconnect' }
  | { type: 'auth:refresh' }
  | { type: 'queue:get'; platform?: Platform; force?: boolean }
  | { type: 'draft:posted'; draftId: string; url?: string | null }
  | { type: 'draft:approve'; draftId: string }
  | { type: 'draft:unposted'; draftId: string }
  | { type: 'repo:connect'; fullName: string }
  | { type: 'github:draft'; url: string }
  | { type: 'job:get'; jobId: string }
  | { type: 'open:app'; path: string }
  | { type: 'open:url'; url: string }
  | { type: 'open:options' }
  | { type: 'settings:update'; patch: Partial<Settings> }

/** Response type for each request. */
export interface BackgroundResponses {
  'state:get': Result<PublicState>
  'auth:connect': Result<PublicState>
  'auth:disconnect': Result<PublicState>
  'auth:refresh': Result<PublicState>
  'queue:get': Result<QueueResponse & { fetchedAt: number; stale?: boolean }>
  'draft:posted': Result<{ item: ExtensionItem }>
  'draft:approve': Result<{ item: ExtensionItem }>
  'draft:unposted': Result<{ item: ExtensionItem }>
  'repo:connect': Result<{ repo: { id: string; fullName: string; webhookConfigured: boolean }; warning?: string }>
  'github:draft': Result<DraftFromGithubResponse>
  'job:get': Result<JobResponse>
  'open:app': Result<null>
  'open:url': Result<null>
  'open:options': Result<null>
  'settings:update': Result<PublicState>
}

export type ResponseFor<R extends BackgroundRequest> = BackgroundResponses[R['type']]

/** Messages the popup sends to a LinkedIn or X tab. */
export type TabRequest =
  | { type: 'composer:probe' }
  | { type: 'composer:insert'; text: string; draftId: string; platform: Platform }

export type TabResponse =
  | { ok: true; platform: Platform; hasComposer: boolean }
  | { ok: false; reason: 'no_composer' | 'insert_failed' | 'wrong_platform'; platform?: Platform }

/** Sends a request to the background worker. Never throws: transport failures become ApiErrors. */
export async function sendToBackground<R extends BackgroundRequest>(request: R): Promise<ResponseFor<R>> {
  try {
    const response = (await chrome.runtime.sendMessage(request)) as ResponseFor<R> | undefined
    if (response) return response
    return transportError('The extension did not answer. Reload the page and try again.') as ResponseFor<R>
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // After an extension update, old content scripts lose their connection.
    const reloaded = /context invalidated|Receiving end does not exist/i.test(message)
    return transportError(
      reloaded
        ? 'CommitFlex was updated. Reload this page to keep using it.'
        : 'The extension did not answer. Reload the page and try again.',
      reloaded ? 'extension_reloaded' : 'transport_error',
    ) as ResponseFor<R>
  }
}

function transportError(error: string, code = 'transport_error') {
  return { ok: false as const, status: 0, code, error }
}
