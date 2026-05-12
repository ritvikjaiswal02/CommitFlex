import {
  Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from '@react-email/components'

interface DigestItem {
  repoName: string
  draftCount: number
  jobUrl: string
}

interface Props {
  firstName: string
  weekRange: string  // e.g. "May 6 – May 12"
  items: DigestItem[]
  dashboardUrl: string
}

export function WeeklyDigestEmail({ firstName, weekRange, items, dashboardUrl }: Props) {
  const total = items.reduce((a, i) => a + i.draftCount, 0)

  return (
    <Html>
      <Head />
      <Preview>{`${total} drafts generated this week across ${items.length} repos.`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={brand}>
            Commit<span style={{ color: '#d0bcff' }}>Flex</span>
          </Heading>

          <Section>
            <Heading as="h1" style={h1}>Hey {firstName} — your week in commits.</Heading>
            <Text style={subtitle}>{weekRange}</Text>
            <Text style={p}>
              {total} new draft{total === 1 ? '' : 's'} generated across {items.length} repo{items.length === 1 ? '' : 's'}.
            </Text>
          </Section>

          <Section style={listWrap}>
            {items.map((item) => (
              <div key={item.repoName} style={row}>
                <div>
                  <Text style={repoName}>{item.repoName}</Text>
                  <Text style={meta}>{item.draftCount} draft{item.draftCount === 1 ? '' : 's'}</Text>
                </div>
                <Link href={item.jobUrl} style={rowLink}>Open →</Link>
              </div>
            ))}
          </Section>

          <Section style={ctaWrap}>
            <Link href={dashboardUrl} style={cta}>Go to dashboard</Link>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            You&apos;re receiving this because weekly digest is enabled.{' '}
            <Link href={`${dashboardUrl}/settings#notifications`} style={footerLink}>
              Manage preferences
            </Link>.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const body: React.CSSProperties = {
  backgroundColor: '#0A0A0A',
  color: '#e5e2e1',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  margin: 0,
  padding: '40px 0',
}
const container: React.CSSProperties = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '32px',
  background: '#141414',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
}
const brand: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  marginTop: 0,
  marginBottom: '32px',
}
const h1: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 600,
  letterSpacing: '-0.02em',
  margin: '0 0 4px',
  color: '#e5e2e1',
}
const subtitle: React.CSSProperties = {
  fontSize: '12px',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '#d0bcff',
  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
  margin: '0 0 16px',
}
const p: React.CSSProperties = { fontSize: '14px', lineHeight: 1.6, color: '#cbc3d7', margin: '0 0 24px' }
const listWrap: React.CSSProperties = { margin: '16px 0' }
const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 0',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
}
const repoName: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
  fontSize: '13px',
  color: '#e5e2e1',
  margin: 0,
}
const meta: React.CSSProperties = { fontSize: '11px', color: '#958ea0', margin: '2px 0 0' }
const rowLink: React.CSSProperties = { color: '#d0bcff', fontSize: '12px', textDecoration: 'none' }
const ctaWrap: React.CSSProperties = { textAlign: 'center', margin: '32px 0' }
const cta: React.CSSProperties = {
  background: '#ffffff',
  color: '#0a0a0a',
  padding: '12px 24px',
  borderRadius: '12px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 600,
  display: 'inline-block',
}
const hr: React.CSSProperties = { border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '32px 0 16px' }
const footer: React.CSSProperties = {
  fontSize: '11px',
  lineHeight: 1.5,
  color: '#958ea0',
  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
}
const footerLink: React.CSSProperties = { color: '#d0bcff', textDecoration: 'underline' }

export default WeeklyDigestEmail
