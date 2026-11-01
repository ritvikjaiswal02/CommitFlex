/**
 * An isolated overlay for on-page UI: a shadow root on <html> (so the page's
 * React tree never removes it), our own design tokens, and a theme that
 * follows the page's light or dark mode.
 */
import tokensCss from '../styles/tokens.css'
import uiCss from '../styles/ui.css'
import overlayCss from './overlay.css'
import { detectPageTheme, h } from '../shared/dom'
import { icon } from '../shared/icons'

export interface Overlay {
  host: HTMLElement
  root: HTMLElement
  shadow: ShadowRoot
  toast: (opts: ToastOptions) => () => void
  destroy: () => void
}

export interface ToastOptions {
  title: string
  body?: string
  tone?: 'default' | 'success' | 'danger'
  actions?: { label: string; variant?: 'primary' | 'ghost'; onClick: () => void | Promise<void> }[]
  /** Milliseconds; 0 keeps it until dismissed. */
  duration?: number
}

const FONT_STYLE_ID = 'commitflex-fonts'

/**
 * Registers the bundled fonts on the page itself: @font-face rules inside a
 * shadow root are ignored, but families declared on the document are
 * usable from inside it. Unique family names never clash with the page's.
 */
function ensureFonts(): void {
  if (document.getElementById(FONT_STYLE_ID)) return
  let sans: string
  let mono: string
  try {
    sans = chrome.runtime.getURL('fonts/schibsted-grotesk-latin.woff2')
    mono = chrome.runtime.getURL('fonts/jetbrains-mono-latin.woff2')
  } catch {
    return // extension context gone (updated); the system font fallback is fine
  }
  const style = document.createElement('style')
  style.id = FONT_STYLE_ID
  style.textContent = [
    `@font-face{font-family:'CommitFlex Sans';font-style:normal;font-weight:400 900;font-display:swap;src:url(${sans}) format('woff2')}`,
    `@font-face{font-family:'CommitFlex Mono';font-style:normal;font-weight:100 800;font-display:swap;src:url(${mono}) format('woff2')}`,
  ].join(' ')
  ;(document.head ?? document.documentElement).appendChild(style)
}

export function createOverlay(id: string): Overlay {
  document.getElementById(id)?.remove()
  ensureFonts()

  const host = document.createElement('div')
  host.id = id
  // The host takes no space and no events; children opt back in.
  host.style.cssText =
    'position:fixed;inset:0 auto auto 0;width:0;height:0;z-index:2147483000;pointer-events:none;'
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = `${tokensCss}\n${uiCss}\n${overlayCss}`
  const root = h('div', { class: 'cx-root cx-overlay' })
  const toasts = h('div', { class: 'cx-toasts', attrs: { role: 'region', 'aria-label': 'CommitFlex notifications' } })
  root.appendChild(toasts)
  shadow.append(style, root)
  document.documentElement.appendChild(host)

  const applyTheme = () => root.setAttribute('data-theme', detectPageTheme())
  applyTheme()
  const themeObserver = new MutationObserver(applyTheme)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-color-mode', 'data-theme', 'style'] })
  if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] })
  const media = matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', applyTheme)

  function toast(opts: ToastOptions): () => void {
    const tone = opts.tone ?? 'default'
    let timer: ReturnType<typeof setTimeout> | null = null
    const el = h('div', {
      class: 'cx-toast',
      dataset: { tone },
      attrs: { role: tone === 'danger' ? 'alert' : 'status', 'aria-live': tone === 'danger' ? 'assertive' : 'polite' },
    })
    const dismiss = () => {
      if (timer) clearTimeout(timer)
      el.dataset.leaving = 'true'
      setTimeout(() => el.remove(), 160)
    }
    const actions = (opts.actions ?? []).map((action) => {
      const button = h('button', {
        class: `cx-btn cx-btn--xs ${action.variant === 'primary' ? 'cx-btn--primary' : 'cx-btn--ghost'} cx-focus`,
        attrs: { type: 'button' },
        text: action.label,
      })
      button.addEventListener('click', async () => {
        button.setAttribute('aria-disabled', 'true')
        try {
          await action.onClick()
        } finally {
          button.removeAttribute('aria-disabled')
        }
      })
      return button
    })
    const toneIcon = tone === 'success' ? icon('circleCheck', 16) : tone === 'danger' ? icon('alert', 16) : null
    el.append(
      toneIcon ? h('span', { class: 'cx-toast-icon' }, toneIcon) : '',
      h(
        'div',
        { class: 'cx-toast-body' },
        h('p', { class: 'cx-toast-title', text: opts.title }),
        opts.body ? h('p', { class: 'cx-toast-text', text: opts.body }) : null,
        actions.length ? h('div', { class: 'cx-toast-actions' }, actions) : null,
      ),
      h(
        'button',
        {
          class: 'cx-btn cx-btn--ghost cx-btn--xs cx-btn--icon cx-focus cx-toast-close',
          attrs: { type: 'button', 'aria-label': 'Dismiss' },
          on: { click: dismiss },
        },
        icon('x', 14),
      ),
    )
    toasts.appendChild(el)
    const duration = opts.duration ?? (actions.length ? 0 : 4000)
    if (duration > 0) timer = setTimeout(dismiss, duration)
    return dismiss
  }

  return {
    host,
    root,
    shadow,
    toast,
    destroy: () => {
      themeObserver.disconnect()
      media.removeEventListener('change', applyTheme)
      host.remove()
    },
  }
}
