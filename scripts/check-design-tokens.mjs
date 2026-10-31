#!/usr/bin/env node
/**
 * Fails when app code uses an arbitrary font size or border radius instead
 * of the tokens in tailwind.config.ts (text-xs … text-5xl, rounded-sm … xl).
 * Each `text-[15px]` or `rounded-[5px]` bypasses the scale and drifts.
 *
 *   node scripts/check-design-tokens.mjs        # exits 1 on violations
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOTS = ['app', 'components']
// Tiny avatar initials are below the type scale on purpose.
const ALLOW = new Set(['components/ui/avatar.tsx'])
const PATTERNS = [
  { name: 'font size', re: /\btext-\[\d+(?:\.\d+)?(?:px|rem|em)\]/g },
  { name: 'border radius', re: /\brounded(?:-[trblse]{1,2})?-\[[^\]]+\]/g },
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(tsx|ts)$/.test(name)) out.push(full)
  }
  return out
}

const problems = []
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative(process.cwd(), file).replace(/[\\]/g, '/')
    if (ALLOW.has(rel)) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      for (const { name, re } of PATTERNS) {
        for (const match of line.matchAll(re)) problems.push(`${rel}:${i + 1}  arbitrary ${name} ${match[0]}`)
      }
    })
  }
}

if (problems.length > 0) {
  console.error(`Use the design tokens instead of arbitrary values:\n${problems.join('\n')}`)
  process.exit(1)
}
console.log('Design tokens: no arbitrary font sizes or radii.')
