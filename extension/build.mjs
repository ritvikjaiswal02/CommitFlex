#!/usr/bin/env node
/**
 * Builds the CommitFlex Chrome extension into extension/dist (load unpacked
 * from there) and, with --zip, packs it for the Chrome Web Store.
 *
 *   pnpm ext:build                      # dist/ for http://localhost:3000
 *   COMMITFLEX_APP_URL=https://commitflex.app pnpm ext:zip
 *   node extension/build.mjs --app-url=https://commitflex.app,http://localhost:3000 --zip
 *   node extension/build.mjs --watch    # rebuild on change while developing
 *   node extension/build.mjs --zip --out=public/commitflex-extension.zip
 *                                       # what `pnpm build` runs: the download
 *                                       # served at /extension/download
 *
 * The first app URL is the default CommitFlex address; every listed origin
 * gets the bridge content script that lets the /extension page hand over a token.
 * Icons are drawn here (no binary assets in the repo).
 */
import { build, context } from 'esbuild'
import { zipSync } from 'fflate'
import { deflateSync } from 'node:zlib'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, 'src')
const dist = join(here, 'dist')

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')

const zip = flag('zip')
const watch = flag('watch')

/* ------------------------------------------------------------------ app URLs */

function toOrigin(input) {
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`Refusing plain http for ${url.host}. Use https.`)
  }
  return url.origin
}

// The app's own URL is the default, so `pnpm build` packs an extension that
// talks to the deployment it ships with.
const rawUrls = (
  option('app-url') ??
  process.env.COMMITFLEX_APP_URL ??
  (process.env.APP_URL || null) ??
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null) ??
  'http://localhost:3000'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const appOrigins = [...new Set(rawUrls.map(toOrigin))]
const defaultAppUrl = appOrigins[0]

const manifestTemplate = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8'))
const version = manifestTemplate.version

/* ------------------------------------------------------------------- bundle */

const entryPoints = {
  background: join(src, 'background.ts'),
  'content/bridge': join(src, 'content/bridge.ts'),
  'content/linkedin': join(src, 'content/linkedin.ts'),
  'content/x': join(src, 'content/x.ts'),
  'content/github': join(src, 'content/github.ts'),
  popup: join(src, 'popup/popup.ts'),
  options: join(src, 'options/options.ts'),
}

const esbuildOptions = {
  entryPoints,
  outdir: dist,
  bundle: true,
  format: 'iife',
  target: ['chrome116'],
  platform: 'browser',
  minify: zip,
  sourcemap: zip ? false : 'linked',
  legalComments: 'none',
  loader: { '.css': 'text' },
  define: {
    __APP_URL__: JSON.stringify(defaultAppUrl),
    __APP_ORIGINS__: JSON.stringify(appOrigins),
    __VERSION__: JSON.stringify(version),
  },
  logLevel: 'warning',
}

/* --------------------------------------------------------------- static files */

function writeStatic() {
  const css = (...files) => files.map((f) => readFileSync(join(src, f), 'utf8')).join('\n')
  writeFileSync(join(dist, 'popup.css'), css('styles/fonts.css', 'styles/tokens.css', 'styles/ui.css', 'popup/popup.css'))
  writeFileSync(join(dist, 'options.css'), css('styles/fonts.css', 'styles/tokens.css', 'styles/ui.css', 'options/options.css'))
  mkdirSync(join(dist, 'fonts'), { recursive: true })
  for (const name of readdirSync(join(src, 'fonts'))) {
    if (name.endsWith('.woff2')) copyFileSync(join(src, 'fonts', name), join(dist, 'fonts', name))
  }
  copyFileSync(join(src, 'popup/popup.html'), join(dist, 'popup.html'))
  copyFileSync(join(src, 'options/options.html'), join(dist, 'options.html'))

  const patterns = appOrigins.map((origin) => `${origin}/*`)
  const manifest = structuredClone(manifestTemplate)
  manifest.host_permissions = [...new Set([...manifest.host_permissions, ...patterns])]
  manifest.content_scripts = [
    ...manifest.content_scripts,
    { matches: patterns, js: ['content/bridge.js'], run_at: 'document_idle' },
  ]
  // In-page panels load the bundled fonts by URL.
  manifest.web_accessible_resources = [
    {
      resources: ['fonts/*.woff2'],
      matches: ['https://www.linkedin.com/*', 'https://x.com/*', 'https://twitter.com/*', 'https://github.com/*'],
    },
  ]
  writeFileSync(join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  mkdirSync(join(dist, 'icons'), { recursive: true })
  for (const size of [16, 32, 48, 128]) writeFileSync(join(dist, 'icons', `icon-${size}.png`), renderIcon(size))
}

/* --------------------------------------------------------------------- icons */

// The commit-node mark (components/brand/logo.tsx) on an ink tile, drawn with
// signed distances and 4x4 supersampling, then encoded as PNG.
const INK = [16, 19, 31]
const WHITE = [255, 255, 255]
const ACCENT = [123, 135, 255]

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function cubic(p0, p1, p2, p3, steps) {
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ])
  }
  return pts
}

const CURVE = [...cubic([7, 12.25], [7, 8.8], [9.3, 6.75], [13.25, 6.75], 32), [14, 6.75]]

function sample(x, y, size) {
  // x, y in a 24-unit tile. Rounded tile first.
  const r = 5.5
  const qx = Math.abs(x - 12) - (12 - r)
  const qy = Math.abs(y - 12) - (12 - r)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
  if (outside > 0) return null

  // Mark: scaled about its centre into the tile.
  const k = 0.7
  const mx = (x - 12) / k + 12.25
  const my = (y - 12) / k + 11.9
  const strokePx = (2 * k * size) / 24
  const w = (strokePx < 1.5 ? (1.5 * 24) / (k * size) : 2) / 2

  if (Math.hypot(mx - 17.75, my - 6.75) <= 3.5) return ACCENT
  if (segDist(mx, my, 7, 3.25, 7, 13.25) <= w) return WHITE
  if (Math.abs(Math.hypot(mx - 7, my - 17.75) - 2.75) <= w) return WHITE
  for (let i = 0; i < CURVE.length - 1; i++) {
    if (segDist(mx, my, CURVE[i][0], CURVE[i][1], CURVE[i + 1][0], CURVE[i + 1][1]) <= w) return WHITE
  }
  return INK
}

function renderIcon(size) {
  const ss = 4
  const rgba = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = ((px + (sx + 0.5) / ss) / size) * 24
          const y = ((py + (sy + 0.5) / ss) / size) * 24
          const c = sample(x, y, size)
          if (!c) continue
          r += c[0]
          g += c[1]
          b += c[2]
          a += 1
        }
      }
      const i = (py * size + px) * 4
      if (a > 0) {
        rgba[i] = Math.round(r / a)
        rgba[i + 1] = Math.round(g / a)
        rgba[i + 2] = Math.round(b / a)
      }
      rgba[i + 3] = Math.round((a / (ss * ss)) * 255)
    }
  }
  return encodePng(size, size, rgba)
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ----------------------------------------------------------------------- zip */

function collect(dir) {
  const files = {}
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) Object.assign(files, collect(full))
    else if (!name.endsWith('.map')) files[relative(dist, full).split('\\').join('/')] = readFileSync(full)
  }
  return files
}

/* ---------------------------------------------------------------------- main */

async function main() {
  rmSync(dist, { recursive: true, force: true })
  mkdirSync(dist, { recursive: true })

  if (watch) {
    const ctx = await context({
      ...esbuildOptions,
      plugins: [{ name: 'static', setup: (b) => b.onEnd(() => { writeStatic(); console.log(`[ext] rebuilt ${new Date().toLocaleTimeString()}`) }) }],
    })
    await ctx.watch()
    console.log(`[ext] watching src/ for ${defaultAppUrl}. Load unpacked from ${dist}`)
    return
  }

  await build(esbuildOptions)
  writeStatic()

  if (zip) {
    const outOption = option('out')
    const out = outOption ? resolve(process.cwd(), outOption) : resolve(here, `commitflex-extension-${version}.zip`)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, zipSync(collect(dist), { level: 9 }))
    console.log(`[ext] packed ${relative(process.cwd(), out)} (${(statSync(out).size / 1024).toFixed(1)} KB) for ${appOrigins.join(', ')}`)
  } else {
    console.log(`[ext] built ${relative(process.cwd(), dist)} for ${appOrigins.join(', ')}. Load unpacked from that folder.`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
