/**
 * Shared email chrome. Mirrors the app's design tokens (porcelain canvas, ink
 * text, one ultramarine accent) with inline styles, because email clients
 * ignore stylesheets.
 */
import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from '@react-email/components'
import type { CSSProperties, ReactNode } from 'react'

export const colors = {
  canvas: '#F4F5F8',
  surface: '#FFFFFF',
  sunken: '#ECEEF3',
  line: '#DDE1E9',
  lineStrong: '#C4CAD6',
  fg: '#10131F',
  fgMuted: '#4A5063',
  fgSubtle: '#6B7286',
  accent: '#2B3FE0',
  accentSoft: '#E9ECFF',
  accentInk: '#1F2EA8',
  success: '#0F7B54',
  successSoft: '#E3F5EC',
  warning: '#A15C00',
  warningSoft: '#FFF2DB',
  danger: '#C8323C',
  dangerSoft: '#FDE8E9',
  linkedin: '#0A66C2',
}

const fontSans =
  "'Schibsted Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const fontMono = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

export const s = {
  body: { backgroundColor: colors.canvas, color: colors.fg, fontFamily: fontSans, margin: 0, padding: '32px 0' },
  container: {
    maxWidth: '560px',
    margin: '0 auto',
    padding: '28px 28px 24px',
    background: colors.surface,
    border: `1px solid ${colors.line}`,
    borderRadius: '10px',
  },
  brand: { fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em', color: colors.fg, margin: '0 0 24px' },
  h1: { fontSize: '22px', lineHeight: '28px', fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 8px', color: colors.fg },
  p: { fontSize: '15px', lineHeight: '24px', color: colors.fgMuted, margin: '0 0 16px' },
  small: { fontSize: '13px', lineHeight: '20px', color: colors.fgSubtle, margin: '0 0 8px' },
  mono: { fontFamily: fontMono, fontSize: '13px' },
  hr: { border: 'none', borderTop: `1px solid ${colors.line}`, margin: '24px 0 16px' },
  footer: { fontSize: '12px', lineHeight: '18px', color: colors.fgSubtle, margin: 0 },
  footerLink: { color: colors.fgMuted, textDecoration: 'underline' },
  link: { color: colors.accent, textDecoration: 'underline' },
} satisfies Record<string, CSSProperties>

export function EmailLayout(props: {
  preview: string
  children: ReactNode
  footer?: ReactNode
  appUrl: string
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={s.body}>
        <Container style={s.container}>
          <Text style={s.brand}>CommitFlex</Text>
          {props.children}
          <Hr style={s.hr} />
          <Text style={s.footer}>
            {props.footer ?? (
              <>
                You get this email because you use CommitFlex.{' '}
                <Link href={`${props.appUrl}/settings?tab=notifications`} style={s.footerLink}>
                  Manage email settings
                </Link>
                .
              </>
            )}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export function EmailButton(props: { href: string; children: ReactNode; variant?: 'primary' | 'secondary' }) {
  const primary = props.variant !== 'secondary'
  return (
    <Link
      href={props.href}
      style={{
        display: 'inline-block',
        padding: '9px 16px',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: 600,
        lineHeight: '20px',
        textDecoration: 'none',
        background: primary ? colors.accent : colors.surface,
        color: primary ? '#FFFFFF' : colors.fg,
        border: `1px solid ${primary ? colors.accent : colors.lineStrong}`,
        marginRight: '8px',
        marginBottom: '8px',
      }}
    >
      {props.children}
    </Link>
  )
}

export function platformName(platform: string): 'LinkedIn' | 'X' {
  return platform === 'twitter' ? 'X' : 'LinkedIn'
}

/** A draft shown as a quoted block with its platform and context line. */
export function PostPreview(props: { platform: string; meta?: string | null; content: string; children?: ReactNode }) {
  const preview = props.content.length > 600 ? `${props.content.slice(0, 597).trimEnd()}…` : props.content
  return (
    <Section
      style={{
        border: `1px solid ${colors.line}`,
        borderRadius: '8px',
        padding: '14px 16px 8px',
        margin: '0 0 16px',
        background: colors.surface,
      }}
    >
      <Text style={{ ...s.small, margin: '0 0 8px', color: colors.fgMuted, fontWeight: 600 }}>
        {platformName(props.platform)}
        {props.meta ? <span style={{ fontWeight: 400, color: colors.fgSubtle }}>{` — ${props.meta}`}</span> : null}
      </Text>
      <Text
        style={{
          fontSize: '14px',
          lineHeight: '22px',
          color: colors.fg,
          margin: '0 0 12px',
          whiteSpace: 'pre-wrap',
          borderLeft: `2px solid ${colors.lineStrong}`,
          paddingLeft: '12px',
        }}
      >
        {preview}
      </Text>
      {props.children}
    </Section>
  )
}
