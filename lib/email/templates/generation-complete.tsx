import {
  Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from '@react-email/components'

interface Props {
  firstName: string
  repoName: string
  draftCount: number
  jobUrl: string
}

export function GenerationCompleteEmail({ firstName, repoName, draftCount, jobUrl }: Props) {
  return (
    <Html>
      <Head />
      <Preview>{`${draftCount} new drafts from ${repoName} are ready to review.`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={brand}>
            Commit<span style={{ color: '#d0bcff' }}>Flex</span>
          </Heading>

          <Section>
            <Heading as="h1" style={h1}>
              Your drafts are ready, {firstName}.
            </Heading>
            <Text style={p}>
              We turned the last week of commits in <strong style={{ color: '#e5e2e1' }}>{repoName}</strong>{' '}
              into {draftCount} draft{draftCount === 1 ? '' : 's'}. Review, tweak the tone, and ship.
            </Text>
          </Section>

          <Section style={ctaWrap}>
            <Link href={jobUrl} style={cta}>Open in CommitFlex →</Link>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            You&apos;re receiving this because email notifications are enabled.{' '}
            <Link href={`${jobUrl.split('/jobs')[0]}/settings#notifications`} style={footerLink}>
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
  margin: '0 0 12px',
  color: '#e5e2e1',
}
const p: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: 1.6,
  color: '#cbc3d7',
  margin: '0 0 24px',
}
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
const hr: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid rgba(255,255,255,0.08)',
  margin: '32px 0 16px',
}
const footer: React.CSSProperties = {
  fontSize: '11px',
  lineHeight: 1.5,
  color: '#958ea0',
  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
}
const footerLink: React.CSSProperties = { color: '#d0bcff', textDecoration: 'underline' }

export default GenerationCompleteEmail
