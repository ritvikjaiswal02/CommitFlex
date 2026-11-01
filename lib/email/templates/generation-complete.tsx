import { Heading, Section, Text } from '@react-email/components'
import { EmailButton, EmailLayout, s } from '../components/layout'

interface Props {
  firstName: string
  repoName: string
  draftCount: number
  jobUrl: string
}

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url.split('/jobs')[0]
  }
}

export function GenerationCompleteEmail({ firstName, repoName, draftCount, jobUrl }: Props) {
  const plural = draftCount === 1 ? 'draft' : 'drafts'
  return (
    <EmailLayout appUrl={originOf(jobUrl)} preview={`${draftCount} new ${plural} from ${repoName} are ready to review.`}>
      <Heading as="h1" style={s.h1}>
        Your drafts are ready, {firstName}
      </Heading>
      <Text style={s.p}>
        We read the recent commits in <span style={s.mono}>{repoName}</span> and wrote {draftCount} {plural}. Read
        them, adjust anything that doesn&apos;t sound like you, then add them to your queue.
      </Text>
      <Section>
        <EmailButton href={jobUrl}>Review drafts</EmailButton>
      </Section>
    </EmailLayout>
  )
}

export default GenerationCompleteEmail
