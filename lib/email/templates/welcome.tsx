import { Heading, Text } from '@react-email/components'
import { EmailButton, EmailLayout, colors, s } from '../components/layout'

export interface WelcomeEmailProps {
  firstName: string
  dashboardUrl: string
  extensionUrl: string
  linkedinConnected: boolean
}

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

export function WelcomeEmail(props: WelcomeEmailProps) {
  const appUrl = originOf(props.dashboardUrl)
  const steps = [
    'When you merge a pull request or publish a release, we write a LinkedIn post and an X post about it.',
    'Every draft lands in your queue with a time slot, and we email it to you with an Approve button.',
    props.linkedinConnected
      ? 'Approved LinkedIn posts publish on their own. X posts open pre-filled in one tap.'
      : 'Approved posts open pre-filled in LinkedIn or X in one tap. Connect LinkedIn and they publish on their own.',
  ]
  return (
    <EmailLayout appUrl={appUrl} preview="Autopilot is on. Here's what happens next.">
      <Heading as="h1" style={s.h1}>
        Autopilot is on, {props.firstName}
      </Heading>
      <Text style={s.p}>Here&apos;s what happens from now on:</Text>
      {steps.map((step, i) => (
        <Text key={i} style={{ ...s.p, margin: '0 0 10px', paddingLeft: '22px', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 0, color: colors.accent, fontWeight: 600 }}>{i + 1}</span>
          {step}
        </Text>
      ))}
      <Text style={{ ...s.p, marginTop: '16px' }}>
        Your first drafts are being written now. Your Pro trial runs for 14 days, no card needed.
      </Text>
      <EmailButton href={props.dashboardUrl}>Open CommitFlex</EmailButton>
      {!props.linkedinConnected ? (
        <EmailButton href={`${appUrl}/api/integrations/linkedin/connect?returnTo=%2Fdashboard`} variant="secondary">
          Connect LinkedIn
        </EmailButton>
      ) : null}
      <EmailButton href={props.extensionUrl} variant="secondary">
        Get the Chrome extension
      </EmailButton>
    </EmailLayout>
  )
}

export default WelcomeEmail
