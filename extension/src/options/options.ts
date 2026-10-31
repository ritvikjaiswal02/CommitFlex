/**
 * Options page: account (connect with a token or disconnect), the CommitFlex
 * address, which on-page buttons to show, and notifications.
 */
import { BUILT_IN_APP_ORIGINS, DEFAULT_APP_URL, originPattern, toOrigin } from '../shared/config'
import { h, replaceChildren } from '../shared/dom'
import { brandIcon, icon, logoMark, spinner } from '../shared/icons'
import { sendToBackground } from '../shared/messages'
import type { PublicState, Settings } from '../shared/types'
import { renderCallout } from '../ui/item-list'
import { applyExtensionTheme } from '../ui/theme'

const app = document.getElementById('app') as HTMLElement
let state: PublicState | null = null

applyExtensionTheme()

function section(title: string, description: string, ...body: (HTMLElement | null)[]): HTMLElement {
  return h(
    'section',
    { class: 'cx-section', attrs: { 'aria-label': title } },
    h('div', {}, h('h2', { class: 'cx-section-title', text: title }), h('p', { class: 'cx-section-desc', text: description })),
    h('div', { class: 'cx-section-body' }, body),
  )
}

function statusLine(): HTMLParagraphElement {
  return h('p', { class: 'cx-status', attrs: { role: 'status', 'aria-live': 'polite' } })
}

function setStatus(el: HTMLElement, tone: 'success' | 'danger' | 'neutral', text: string): void {
  el.dataset.tone = tone
  el.textContent = text
}

/* ---------------------------------------------------------------- account */

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || email || '?').trim()
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

function accountSection(): HTMLElement {
  const status = statusLine()

  if (state?.connected && state.account) {
    const account = state.account
    const avatar = h('div', { class: 'cx-avatar', attrs: { 'aria-hidden': 'true' } })
    if (account.image && /^https:\/\//.test(account.image)) {
      avatar.appendChild(h('img', { attrs: { src: account.image, alt: '' } }))
    } else {
      avatar.textContent = initials(account.name, account.email)
    }
    const plan = state.plan
    const disconnect = h(
      'button',
      { class: 'cx-btn cx-btn--secondary cx-focus', attrs: { type: 'button' } },
      icon('logOut', 16),
      h('span', { text: 'Disconnect' }),
    )
    disconnect.addEventListener('click', async () => {
      replaceChildren(disconnect, spinner(16), h('span', { text: 'Disconnecting' }))
      const result = await sendToBackground({ type: 'auth:disconnect' })
      if (result.ok) {
        state = result.data
        render()
      } else {
        replaceChildren(disconnect, icon('logOut', 16), h('span', { text: 'Disconnect' }))
        setStatus(status, 'danger', result.error)
      }
    })
    return section(
      'Account',
      'The CommitFlex account whose queue this browser shows.',
      h(
        'div',
        { class: 'cx-account' },
        avatar,
        h(
          'div',
          { style: { minWidth: '0' } },
          h('p', { class: 'cx-medium cx-truncate', text: account.name || account.email || 'Signed in' }),
          h('p', { class: 'cx-muted cx-truncate', text: account.email ?? '' }),
        ),
        plan ? h('span', { class: `cx-badge ${plan.id === 'free' ? '' : 'cx-badge--accent'}`, text: plan.status === 'trialing' ? 'Pro trial' : plan.name }) : null,
      ),
      h(
        'div',
        { class: 'cx-row' },
        h(
          'button',
          {
            class: 'cx-btn cx-btn--secondary cx-focus',
            attrs: { type: 'button' },
            on: { click: () => void sendToBackground({ type: 'open:app', path: '/extension' }) },
          },
          h('span', { text: 'Manage tokens' }),
          icon('externalLink', 16),
        ),
        disconnect,
      ),
      h('p', { class: 'cx-help', text: `Token ${state.tokenPrefix ?? ''}… on ${state.appUrl}` }),
      status,
    )
  }

  const input = h('input', {
    class: 'cx-input cx-mono',
    attrs: { id: 'token', type: 'password', placeholder: 'cfx_…', autocomplete: 'off', spellcheck: 'false' },
  })
  const save = h('button', { class: 'cx-btn cx-btn--primary cx-btn--md cx-focus', attrs: { type: 'submit' }, text: 'Save' })
  const form = h(
    'form',
    { class: 'cx-field', attrs: { novalidate: true } },
    h('label', { class: 'cx-label', attrs: { for: 'token' }, text: 'Extension token' }),
    h('div', { class: 'cx-inline-form' }, input, save),
    h('p', { class: 'cx-help', text: 'Create one on the Extension page in CommitFlex. Tokens start with cfx_.' }),
    status,
  )
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const token = input.value.trim()
    if (!token) {
      input.setAttribute('aria-invalid', 'true')
      setStatus(status, 'danger', 'Paste your token first.')
      return
    }
    save.setAttribute('aria-disabled', 'true')
    replaceChildren(save, spinner(16))
    const result = await sendToBackground({ type: 'auth:connect', token, appUrl: state?.appUrl ?? DEFAULT_APP_URL })
    save.removeAttribute('aria-disabled')
    replaceChildren(save, 'Save')
    if (!result.ok) {
      input.setAttribute('aria-invalid', 'true')
      setStatus(status, 'danger', result.error)
      return
    }
    state = result.data
    render()
  })

  return section(
    'Account',
    'Connect this browser to your CommitFlex account.',
    state?.invalid
      ? renderCallout('warning', 'Your extension token stopped working', 'It was revoked or has expired. Connect again from CommitFlex, or paste a new token below.')
      : null,
    h(
      'div',
      { class: 'cx-row' },
      h(
        'button',
        {
          class: 'cx-btn cx-btn--secondary cx-focus',
          attrs: { type: 'button' },
          on: { click: () => void sendToBackground({ type: 'open:app', path: '/extension' }) },
        },
        h('span', { text: 'Connect from CommitFlex' }),
        icon('externalLink', 16),
      ),
    ),
    form,
  )
}

/* ---------------------------------------------------------------- address */

function addressSection(): HTMLElement {
  const current = state?.settings.appUrl ?? DEFAULT_APP_URL
  const input = h('input', {
    class: 'cx-input',
    attrs: { id: 'app-url', type: 'url', value: current, placeholder: DEFAULT_APP_URL, autocomplete: 'off', spellcheck: 'false' },
  })
  const status = statusLine()
  const save = h('button', { class: 'cx-btn cx-btn--secondary cx-btn--md cx-focus', attrs: { type: 'submit' }, text: 'Save' })
  const form = h(
    'form',
    { class: 'cx-field', attrs: { novalidate: true } },
    h('label', { class: 'cx-label', attrs: { for: 'app-url' }, text: 'CommitFlex address' }),
    h('div', { class: 'cx-inline-form' }, input, save),
    h('p', { class: 'cx-help', text: 'Only change this if you run your own CommitFlex. Changing it signs this browser out.' }),
    status,
  )
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const origin = toOrigin(input.value)
    if (!origin) {
      input.setAttribute('aria-invalid', 'true')
      setStatus(status, 'danger', 'Enter a full https address, such as https://commitflex.app.')
      return
    }
    input.removeAttribute('aria-invalid')
    const needsPermission = !BUILT_IN_APP_ORIGINS.includes(origin)
    const proceed = async (granted: boolean) => {
      if (!granted) {
        setStatus(status, 'danger', 'Chrome needs access to that address so the extension can talk to it.')
        return
      }
      if (state?.connected && state.appUrl !== origin) await sendToBackground({ type: 'auth:disconnect' })
      const result = await sendToBackground({ type: 'settings:update', patch: { appUrl: origin } })
      if (!result.ok) {
        setStatus(status, 'danger', result.error)
        return
      }
      state = result.data
      render()
    }
    // permissions.request must run inside the click, before any await.
    if (needsPermission) {
      chrome.permissions.request({ origins: [originPattern(origin)] }).then(proceed, () => proceed(false))
    } else {
      void proceed(true)
    }
  })
  return section('CommitFlex address', 'Where the extension sends requests.', form)
}

/* ---------------------------------------------------------------- toggles */

function toggleRow(
  key: keyof Pick<Settings, 'composerLinkedIn' | 'composerX' | 'githubButton' | 'notifications'>,
  title: string,
  description: string,
  mark: SVGSVGElement | null,
): HTMLElement {
  const checked = !!state?.settings[key]
  const id = `toggle-${key}`
  const button = h('button', {
    class: 'cx-switch cx-focus',
    attrs: { id, type: 'button', role: 'switch', 'aria-checked': checked ? 'true' : 'false', 'aria-labelledby': `${id}-label` },
  })
  button.addEventListener('click', async () => {
    const next = button.getAttribute('aria-checked') !== 'true'
    button.setAttribute('aria-checked', next ? 'true' : 'false')
    const result = await sendToBackground({ type: 'settings:update', patch: { [key]: next } })
    if (result.ok) state = result.data
    else button.setAttribute('aria-checked', next ? 'false' : 'true')
  })
  return h(
    'div',
    { class: 'cx-toggle-row' },
    h(
      'div',
      { class: 'cx-toggle-label' },
      mark,
      h('div', {}, h('p', { class: 'cx-medium', attrs: { id: `${id}-label` }, text: title }), h('p', { class: 'cx-muted', text: description })),
    ),
    button,
  )
}

/* ----------------------------------------------------------------- render */

function render(): void {
  replaceChildren(
    app,
    h(
      'header',
      { class: 'cx-options-head' },
      h('div', { class: 'cx-brand' }, logoMark(22), h('span', { text: 'CommitFlex' })),
    ),
    h('h1', { class: 'cx-page-title', text: 'Extension settings' }),
    h('p', { class: 'cx-page-desc', text: 'Post your drafts from inside LinkedIn and X, and draft posts from GitHub.' }),
    h(
      'div',
      { class: 'cx-sections' },
      accountSection(),
      section(
        'On-page buttons',
        'Where the CommitFlex button appears.',
        toggleRow('composerLinkedIn', 'LinkedIn composer', 'Your LinkedIn queue in the corner of the post composer.', brandIcon('linkedin', 16)),
        toggleRow('composerX', 'X composer', 'Your X queue in the corner of the post composer.', brandIcon('twitter', 16)),
        toggleRow('githubButton', 'GitHub', 'A Draft a post button on merged pull requests and releases.', brandIcon('github', 16)),
      ),
      section(
        'Notifications',
        'Desktop notifications from the extension.',
        toggleRow('notifications', 'Drafts ready', 'Tell me when drafts started from GitHub are ready.', null),
      ),
      addressSection(),
    ),
    h(
      'footer',
      { class: 'cx-options-foot' },
      h('span', { text: `Version ${state?.version ?? ''}` }),
      h('span', { text: 'Alt+Shift+C opens your queue inside a LinkedIn or X composer.' }),
    ),
  )
}

async function init(): Promise<void> {
  replaceChildren(app, h('div', { class: 'cx-row cx-muted' }, spinner(16), h('span', { text: 'Loading settings' })))
  const result = await sendToBackground({ type: 'state:get' })
  if (!result.ok) {
    replaceChildren(app, renderCallout('danger', "Settings didn't load", result.error))
    return
  }
  state = result.data
  render()
}

void init()
