/**
 * Tiny DOM builder. Everything is created with createElement and textContent,
 * never innerHTML, so draft text can't inject markup and pages that enforce
 * Trusted Types (LinkedIn, X, GitHub) don't block the UI.
 */
type Child = Node | string | number | null | undefined | false
type Handler = (event: Event) => void

export interface Props {
  class?: string
  text?: string
  attrs?: Record<string, string | number | boolean | null | undefined>
  style?: Partial<CSSStyleDeclaration>
  on?: Record<string, Handler>
  dataset?: Record<string, string>
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (props.class) el.className = props.class
  if (props.text !== undefined) el.textContent = props.text
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value === null || value === undefined || value === false) continue
      el.setAttribute(key, value === true ? '' : String(value))
    }
  }
  if (props.style) Object.assign(el.style, props.style)
  if (props.dataset) Object.assign(el.dataset, props.dataset)
  if (props.on) {
    for (const [event, handler] of Object.entries(props.on)) el.addEventListener(event, handler)
  }
  append(el, children)
  return el
}

export function append(parent: Node, children: (Child | Child[])[]): void {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue
    parent.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child)
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild)
}

export function replaceChildren(el: Element, ...children: (Child | Child[])[]): void {
  clear(el)
  append(el, children)
}

const SVG_NS = 'http://www.w3.org/2000/svg'

export function svg(
  attrs: Record<string, string | number>,
  nodes: [string, Record<string, string | number>][],
): SVGSVGElement {
  const root = document.createElementNS(SVG_NS, 'svg')
  for (const [key, value] of Object.entries(attrs)) root.setAttribute(key, String(value))
  for (const [tag, nodeAttrs] of nodes) {
    const node = document.createElementNS(SVG_NS, tag)
    for (const [key, value] of Object.entries(nodeAttrs)) node.setAttribute(key, String(value))
    root.appendChild(node)
  }
  return root
}

/** Copies text to the clipboard. Works in extension pages and content scripts (needs a user gesture). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      area.style.pointerEvents = 'none'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** Light or dark, from an explicit attribute or the luminance of the page background. */
export function detectPageTheme(): 'light' | 'dark' {
  const html = document.documentElement
  const prefersDark = () => matchMedia('(prefers-color-scheme: dark)').matches
  // GitHub: data-color-mode="light" | "dark" | "auto". LinkedIn: html.theme--dark.
  const mode = html.getAttribute('data-color-mode')
  if (mode === 'dark' || html.classList.contains('theme--dark')) return 'dark'
  if (mode === 'light' || html.classList.contains('theme--light')) return 'light'
  if (mode === 'auto') return prefersDark() ? 'dark' : 'light'

  for (const el of [document.body, html]) {
    if (!el) continue
    const color = getComputedStyle(el).backgroundColor
    const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(color)
    if (!match) continue
    const alpha = match[4] === undefined ? 1 : Number(match[4])
    if (alpha < 0.5) continue
    const [r, g, b] = [match[1], match[2], match[3]].map(Number)
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    return luminance < 0.45 ? 'dark' : 'light'
  }
  return prefersDark() ? 'dark' : 'light'
}
