import { Heading, Link, Section, Text } from '@react-email/components'
import { EmailButton, EmailLayout, colors, s } from '../components/layout'

interface DigestItem {
  repoName: string
  draftCount: number
  jobUrl: string
}

interface Props {
  firstName: string
  /** e.g. "6 May to 12 May" */
  weekRange: string
  items: DigestItem[]
  dashboardUrl: string
}

export function WeeklyDigestEmail({ firstName, weekRange, items, dashboardUrl }: Props) {
  const total = items.reduce((a, i) => a + i.draftCount, 0)
  const appUrl = dashboardUrl.replace(/\/dashboard\/?$/, '')
  return (
    <EmailLayout
      appUrl={appUrl}
      preview={`${total} drafts from ${items.length} ${items.length === 1 ? 'repo' : 'repos'} this week.`}
    >
      <Heading as="h1" style={s.h1}>
        Your week in commits, {firstName}
      </Heading>
      <Text style={s.small}>{weekRange}</Text>
      <Text style={s.p}>
        {total} new {total === 1 ? 'draft' : 'drafts'} from {items.length} {items.length === 1 ? 'repo' : 'repos'}.
      </Text>
      <Section style={{ margin: '0 0 16px' }}>
        {items.map((item) => (
          <Text
            key={item.repoName}
            style={{ ...s.p, margin: 0, padding: '10px 0', borderBottom: `1px solid ${colors.line}` }}
          >
            <span style={{ ...s.mono, color: colors.fg }}>{item.repoName}</span>
            <span style={{ color: colors.fgSubtle }}>{`  ${item.draftCount} ${item.draftCount === 1 ? 'draft' : 'drafts'}  `}</span>
            <Link href={item.jobUrl} style={s.link}>
              Open
            </Link>
          </Text>
        ))}
      </Section>
      <EmailButton href={dashboardUrl}>Open dashboard</EmailButton>
    </EmailLayout>
  )
}

export default WeeklyDigestEmail
