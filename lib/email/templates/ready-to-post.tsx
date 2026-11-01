import { Heading, Section, Text } from '@react-email/components'
import { EmailButton, EmailLayout, PostPreview, platformName, s } from '../components/layout'

export interface ReadyEmailItem {
  platform: string
  content: string
  /** X intent URL or LinkedIn composer URL, pre-filled. */
  intentUrl: string
  /** One-click "I posted it" link (approval token, action=posted). */
  postedUrl: string
  reason?: string | null
}

interface Props {
  firstName: string
  items: ReadyEmailItem[]
  queueUrl: string
  extensionUrl: string
  appUrl: string
}

export function ReadyToPostEmail(props: Props) {
  return (
    <EmailLayout
      appUrl={props.appUrl}
      preview={props.items.length === 1 ? 'Your post is ready. One tap to publish.' : `${props.items.length} posts are ready to publish.`}
    >
      <Heading as="h1" style={s.h1}>
        {props.items.length === 1 ? 'Your post is ready' : `${props.items.length} posts are ready`}
      </Heading>
      <Text style={s.p}>
        Hi {props.firstName}, it&apos;s time. Each button opens the composer with the text filled in, so posting takes
        one tap. Then mark it as posted so your queue stays accurate.
      </Text>
      {props.items.map((item, i) => (
        <PostPreview key={i} platform={item.platform} meta={item.reason ?? null} content={item.content}>
          <Section>
            <EmailButton href={item.intentUrl}>{`Post on ${platformName(item.platform)}`}</EmailButton>
            <EmailButton href={item.postedUrl} variant="secondary">
              I posted it
            </EmailButton>
          </Section>
        </PostPreview>
      ))}
      <Text style={s.small}>
        With the CommitFlex Chrome extension, your queue appears inside the LinkedIn and X composers and inserts the text
        for you.
      </Text>
      <EmailButton href={props.queueUrl} variant="secondary">
        Open queue
      </EmailButton>
      <EmailButton href={props.extensionUrl} variant="secondary">
        Get the extension
      </EmailButton>
    </EmailLayout>
  )
}

export default ReadyToPostEmail
