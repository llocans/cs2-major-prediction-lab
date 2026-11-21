export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-5xl font-bold leading-none tracking-tight">{title}</h1>
      <p className="max-w-prose text-sm text-ink-2">{description}</p>
      <p className="text-xs uppercase tracking-wider text-ink-3">Planned</p>
    </div>
  )
}
