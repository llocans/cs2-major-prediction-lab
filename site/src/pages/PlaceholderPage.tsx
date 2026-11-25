/**
 * A page that has no content yet. A stage that has not started shows its dates and "Soon"; other
 * pages a description and "Planned".
 */
export function PlaceholderPage(
  props: { title: string } & ({ description: string } | { dates: string }),
) {
  const soon = 'dates' in props
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-5xl font-bold leading-none tracking-tight">{props.title}</h1>
      <p className={`max-w-prose text-sm text-ink-2 ${soon ? 'num' : ''}`}>
        {soon ? props.dates : props.description}
      </p>
      <p className="text-xs uppercase tracking-wider text-ink-3">{soon ? 'Soon' : 'Planned'}</p>
    </div>
  )
}
