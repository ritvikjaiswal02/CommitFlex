import { Heading, Section, Text } from '@react-email/components'
import { EmailButton, EmailLayout, PostPreview, platformName, s } from '../components/layout'

export interface ApprovalEmailItem {
  platform: string
  content: string
  /** e.g. "Scheduled for Tue, 4 Nov at 9:00 IST" */
  when: string | null
  approveUrl: string
  skipUrl?: string | null
}

interface Props {
  firstName: string
  repoName: string
  /** PR title, release tag or 'Weekly digest'. */
  sourceTitle: string | null
  items: ApprovalEmailItem[]
  reviewUrl: string
  appUrl: string
  /** Reviewer emails (Team) are written to someone other than the author. */
  reviewerFor?: string | null
  /** The slot passed while the draft waited, and it moved to a new time. */
  reminder?: boolean
}

export function ApprovalRequestEmail(props: Props) {
  const { items, repoName, sourceTitle } = props
  const what = sourceTitle ? `${sourceTitle} in ${repoName}` : repoName
  const heading = props.reminder
    ? 'A draft is still waiting for you'
    : props.reviewerFor
      ? `${props.reviewerFor} has drafts for you to review`
      : items.length === 1
        ? 'One draft to approve'
        : `${items.length} drafts to approve`

  return (
    <EmailLayout appUrl={props.appUrl} preview={`Approve to post about ${what}.`}>
      <Heading as="h1" style={s.h1}>
        {heading}
      </Heading>
      <Text style={s.p}>
        {props.reminder
          ? `The slot for this draft passed before it was approved, so we moved it to the next free time. Approve it and it goes out then.`
          : props.reviewerFor
            ? `CommitFlex wrote these from ${what}. Approve them and they go out at the time shown.`
            : `Hi ${props.firstName}, we wrote these from ${what}. Approve one and it goes out at the time shown. Nothing is posted until you do.`}
      </Text>
      {items.map((item, i) => (
        <PostPreview key={i} platform={item.platform} meta={item.when} content={item.content}>
          <Section>
            <EmailButton href={item.approveUrl}>{`Approve for ${platformName(item.platform)}`}</EmailButton>
            {item.skipUrl ? (
              <EmailButton href={item.skipUrl} variant="secondary">
                Skip
              </EmailButton>
            ) : null}
          </Section>
        </PostPreview>
      ))}
      <Text style={s.small}>Want to change the wording first? Edit the drafts in CommitFlex, then approve them there.</Text>
      <EmailButton href={props.reviewUrl} variant="secondary">
        Edit in CommitFlex
      </EmailButton>
    </EmailLayout>
  )
}

export default ApprovalRequestEmail
