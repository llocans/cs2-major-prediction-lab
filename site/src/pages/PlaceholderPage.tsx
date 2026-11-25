import { Page, PageHeader } from '../components/Page.tsx'

/**
 * A page that has no content yet. A stage that has not started shows its dates and "Soon"; other
 * pages a description and "Planned".
 */
export function PlaceholderPage(
  props: { title: string } & ({ description: string } | { dates: string }),
) {
  const soon = 'dates' in props
  return (
    <Page>
      <PageHeader
        title={props.title}
        subtitle={soon ? props.dates : props.description}
        tag={soon ? 'Soon' : 'Planned'}
      />
    </Page>
  )
}
