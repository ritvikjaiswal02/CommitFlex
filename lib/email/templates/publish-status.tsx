import { Heading, Section, Text } from '@react-email/components'
import { EmailButton, EmailLayout, PostPreview, s } from '../components/layout'

type Kind = 'published' | 'failed' | 'linkedin_expired' | 'linkedin_expiring'

interface Props {
  kind: Kind
  firstName: string
  appUrl: string
  /** The post, when the email is about one. */
  platform?: string
  content?: string | null
  postUrl?: string | null
  error?: string | null
  /** For linkedin_expiring: 'Fri, 14 Nov'. */
  expiresOn?: string | null
}

const COPY: Record<Kind, { preview: string; heading: string }> = {
  published: { preview: 'Published to LinkedIn.', heading: 'Published to LinkedIn' },
  failed: { preview: 'A post could not be published.', heading: 'A post could not be published' },
  linkedin_expired: {
    preview: 'Reconnect LinkedIn so autopilot can keep posting.',
    heading: 'Reconnect LinkedIn',
  },
  linkedin_expiring: {
    preview: 'Your LinkedIn connection expires soon.',
    heading: 'Your LinkedIn connection expires soon',
  },
}

/** Publishing receipts and problems: published, failed, and LinkedIn reconnects. */
export function PublishStatusEmail(props: Props) {
  const copy = COPY[props.kind]
  const connectUrl = `${props.appUrl}/api/integrations/linkedin/connect?returnTo=${encodeURIComponent('/settings?tab=connections')}`
  return (
    <EmailLayout appUrl={props.appUrl} preview={copy.preview}>
      <Heading as="h1" style={s.h1}>
        {copy.heading}
      </Heading>

      {props.kind === 'published' ? (
        <Text style={s.p}>Hi {props.firstName}, your post is live.</Text>
      ) : null}
      {props.kind === 'failed' ? (
        <Text style={s.p}>
          We tried three times and LinkedIn kept refusing the post
          {props.error ? `: "${props.error}"` : '.'} It&apos;s still in your queue. Open it to post it yourself or try again.
        </Text>
      ) : null}
      {props.kind === 'linkedin_expired' ? (
        <Text style={s.p}>
          LinkedIn rejected the post because your connection expired. Reconnect LinkedIn and autopilot will publish
          directly again. Until then, posts are marked ready and we email you a one-tap link instead, so nothing is lost.
        </Text>
      ) : null}
      {props.kind === 'linkedin_expiring' ? (
        <Text style={s.p}>
          LinkedIn connections last 60 days. Yours expires on {props.expiresOn ?? 'a few days from now'}. Reconnect now
          and scheduled posts keep going out on time.
        </Text>
      ) : null}

      {props.content ? (
        <PostPreview platform={props.platform ?? 'linkedin'} content={props.content} />
      ) : null}

      <Section>
        {props.kind === 'published' && props.postUrl ? <EmailButton href={props.postUrl}>View on LinkedIn</EmailButton> : null}
        {props.kind === 'failed' ? <EmailButton href={`${props.appUrl}/queue?status=failed`}>Open queue</EmailButton> : null}
        {props.kind === 'linkedin_expired' || props.kind === 'linkedin_expiring' ? (
          <EmailButton href={connectUrl}>Reconnect LinkedIn</EmailButton>
        ) : null}
      </Section>
    </EmailLayout>
  )
}

export default PublishStatusEmail
