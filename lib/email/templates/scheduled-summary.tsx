import { Heading, Section, Text } from '@react-email/components'
import { EmailButton, EmailLayout, PostPreview, platformName, s } from '../components/layout'

export interface ScheduledEmailItem {
  platform: string
  content: string
  when: string
  skipUrl: string
}

interface Props {
  firstName: string
  repoName: string
  sourceTitle: string | null
  items: ScheduledEmailItem[]
  queueUrl: string
  appUrl: string
}

/** Auto-approve mode: tells the user what goes out and when, with a Skip link per post. */
export function ScheduledSummaryEmail(props: Props) {
  const what = props.sourceTitle ? `${props.sourceTitle} in ${props.repoName}` : props.repoName
  return (
    <EmailLayout appUrl={props.appUrl} preview={`Scheduled: ${props.items.length} posts about ${what}.`}>
      <Heading as="h1" style={s.h1}>
        {props.items.length === 1 ? 'One post is scheduled' : `${props.items.length} posts are scheduled`}
      </Heading>
      <Text style={s.p}>
        Hi {props.firstName}, autopilot wrote and scheduled these from {what}. They go out at the times below unless you
        skip them.
      </Text>
      {props.items.map((item, i) => (
        <PostPreview key={i} platform={item.platform} meta={item.when} content={item.content}>
          <Section>
            <EmailButton href={item.skipUrl} variant="secondary">{`Skip ${platformName(item.platform)} post`}</EmailButton>
          </Section>
        </PostPreview>
      ))}
      <EmailButton href={props.queueUrl} variant="secondary">
        Open queue
      </EmailButton>
    </EmailLayout>
  )
}

export default ScheduledSummaryEmail
