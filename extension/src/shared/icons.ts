/**
 * Icons as SVG node lists, rendered with createElementNS (see dom.ts).
 * UI icons are lucide (ISC licence), drawn at strokeWidth 1.75 like the app.
 * Brand marks (LinkedIn, X, GitHub) are filled paths, matching components/brand.
 */
import { svg } from './dom'
import type { ItemStatus, Platform } from './types'

type Nodes = [string, Record<string, string | number>][]

const LUCIDE: Record<string, Nodes> = {
  copy: [
    ['rect', { width: 14, height: 14, x: 8, y: 8, rx: 2, ry: 2 }],
    ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
  ],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  externalLink: [
    ['path', { d: 'M15 3h6v6' }],
    ['path', { d: 'M10 14 21 3' }],
    ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }],
  ],
  x: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }],
  ],
  settings: [
    [
      'path',
      {
        d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915',
      },
    ],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
  refresh: [
    ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
    ['path', { d: 'M21 3v5h-5' }],
    ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
    ['path', { d: 'M8 16H3v5' }],
  ],
  logOut: [
    ['path', { d: 'm16 17 5-5-5-5' }],
    ['path', { d: 'M21 12H9' }],
    ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }],
  ],
  gitPullRequest: [
    ['circle', { cx: 18, cy: 18, r: 3 }],
    ['circle', { cx: 6, cy: 6, r: 3 }],
    ['path', { d: 'M13 6h3a2 2 0 0 1 2 2v7' }],
    ['line', { x1: 6, x2: 6, y1: 9, y2: 21 }],
  ],
  tag: [
    [
      'path',
      {
        d: 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z',
      },
    ],
    ['circle', { cx: 7.5, cy: 7.5, r: 0.5, fill: 'currentColor' }],
  ],
  alert: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['line', { x1: 12, x2: 12, y1: 8, y2: 12 }],
    ['line', { x1: 12, x2: 12.01, y1: 16, y2: 16 }],
  ],
  circleCheck: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],
  fileText: [
    ['path', { d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z' }],
    ['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }],
    ['path', { d: 'M10 9H8' }],
    ['path', { d: 'M16 13H8' }],
    ['path', { d: 'M16 17H8' }],
  ],
  plug: [
    ['path', { d: 'M12 22v-5' }],
    ['path', { d: 'M15 8V2' }],
    ['path', { d: 'M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z' }],
    ['path', { d: 'M9 8V2' }],
  ],
  cornerDownLeft: [
    ['path', { d: 'M20 4v7a4 4 0 0 1-4 4H4' }],
    ['path', { d: 'm9 10-5 5 5 5' }],
  ],
  key: [
    ['path', { d: 'm15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4' }],
    ['path', { d: 'm21 2-9.6 9.6' }],
    ['circle', { cx: 7.5, cy: 15.5, r: 5.5 }],
  ],
  inbox: [
    ['polyline', { points: '22 12 16 12 14 15 10 15 8 12 2 12' }],
    ['path', { d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z' }],
  ],
}

export type IconName = keyof typeof LUCIDE

export function icon(name: IconName, size = 16, className?: string): SVGSVGElement {
  const el = svg(
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.75,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    LUCIDE[name],
  )
  if (className) el.setAttribute('class', className)
  return el
}

/** A rotating ring, same geometry as the app's Spinner. */
export function spinner(size = 16): SVGSVGElement {
  const el = svg({ width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', class: 'cx-spinner' }, [
    ['circle', { cx: 8, cy: 8, r: 6.25, stroke: 'currentColor', 'stroke-opacity': 0.22, 'stroke-width': 1.75 }],
    ['path', { d: 'M8 1.75a6.25 6.25 0 0 1 6.25 6.25', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round' }],
  ])
  return el
}

/** The commit-node mark (components/brand/logo.tsx). The tip node is accent. */
export function logoMark(size = 20): SVGSVGElement {
  const el = svg({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' }, [
    ['path', { d: 'M7 3.25v10', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }],
    ['circle', { cx: 7, cy: 17.75, r: 2.75, stroke: 'currentColor', 'stroke-width': 2 }],
    ['path', { d: 'M7 12.25c0-3.45 2.3-5.5 6.25-5.5H14', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }],
    ['circle', { cx: 17.75, cy: 6.75, r: 3.5, fill: 'rgb(var(--c-accent))' }],
  ])
  return el
}

const BRAND: Record<Platform | 'github', { viewBox: string; d: string; label: string }> = {
  linkedin: {
    viewBox: '0 0 24 24',
    label: 'LinkedIn',
    d: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  },
  twitter: {
    viewBox: '0 0 24 24',
    label: 'X',
    d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  github: {
    viewBox: '0 0 16 16',
    label: 'GitHub',
    d: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z',
  },
}

export function brandIcon(platform: Platform | 'github', size = 14, title?: string): SVGSVGElement {
  const meta = BRAND[platform]
  const el = svg(
    {
      width: size,
      height: size,
      viewBox: meta.viewBox,
      fill: 'currentColor',
      class: `cx-platform cx-platform-${platform}`,
      ...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': 'true' }),
    },
    [['path', { d: meta.d }]],
  )
  return el
}

const RING = 6.25

/** The commit-node status glyph (components/ui/status-node.tsx), drawn in a 16-unit box. */
export function statusNode(state: ItemStatus, label: string, size: 'sm' | 'md' = 'sm'): SVGSVGElement {
  const ring = (cls: string) => ['circle', { cx: 8, cy: 8, r: RING, class: `n-ring ${cls}` }] as [string, Record<string, string | number>]
  let nodes: Nodes
  switch (state) {
    case 'pending_review':
      nodes = [ring('n-warning'), ['circle', { cx: 8, cy: 8, r: 2, class: 'n-warning-fill' }]]
      break
    case 'approved':
      nodes = [ring('n-accent'), ['path', { d: `M8 ${8 - RING} A${RING} ${RING} 0 0 0 8 ${8 + RING} Z`, class: 'n-accent-fill' }]]
      break
    case 'scheduled':
      nodes = [ring('n-accent'), ['circle', { cx: 8, cy: 8, r: 2, class: 'n-accent-fill' }]]
      break
    case 'ready':
      nodes = [
        ['circle', { cx: 8, cy: 8, r: 7, class: 'n-accent-fill' }],
        ['circle', { cx: 8, cy: 8, r: 2, class: 'n-accent-fg' }],
      ]
      break
    case 'publishing':
      nodes = [ring('n-accent')]
      break
    case 'published':
      nodes = [
        ['circle', { cx: 8, cy: 8, r: 7, class: 'n-success-fill' }],
        ['path', { d: 'M4.9 8.2 7.05 10.3 11.1 6', class: 'n-mark' }],
      ]
      break
    case 'failed':
      nodes = [
        ['circle', { cx: 8, cy: 8, r: 7, class: 'n-danger-fill' }],
        ['path', { d: 'M5.75 5.75 10.25 10.25M10.25 5.75 5.75 10.25', class: 'n-mark' }],
      ]
      break
    case 'skipped':
      nodes = [['circle', { cx: 8, cy: 8, r: RING, class: 'n-ring n-line', 'stroke-dasharray': '2.3 2.6' }]]
      break
    default:
      nodes = [ring('n-line')]
  }
  return svg(
    { viewBox: '0 0 16 16', class: `cx-node${size === 'md' ? ' cx-node--md' : ''}`, role: 'img', 'aria-label': label },
    nodes,
  )
}
