import { Heading, Text } from '@react-email/components'
import { EmailButton, EmailLayout, s } from '../components/layout'

interface Props {
  firstName: string
  used: number
  max: number
  planName: string
  nextPlanName: string
  nextPlanMax: number | null
  /** What we skipped, e.g. 'Merged PR "Add retries" in acme/api'. */
  skipped: string | null
  appUrl: string
}

export function LimitReachedEmail(props: Props) {
  return (
    <EmailLayout appUrl={props.appUrl} preview={`You've used this month's drafts.`}>
      <Heading as="h1" style={s.h1}>
        You&apos;ve used this month&apos;s drafts
      </Heading>
      <Text style={s.p}>
        Hi {props.firstName}, you&apos;ve used {props.used} of {props.max} drafts on the {props.planName} plan this
        month, so autopilot paused.
        {props.skipped ? ` We didn't write about ${props.skipped}.` : ''} It picks up again on the 1st.
      </Text>
      {props.nextPlanMax ? (
        <Text style={s.p}>
          {props.nextPlanName} includes {props.nextPlanMax} drafts a month.
        </Text>
      ) : null}
      <EmailButton href={`${props.appUrl}/billing`}>{`Upgrade to ${props.nextPlanName}`}</EmailButton>
    </EmailLayout>
  )
}

export default LimitReachedEmail
