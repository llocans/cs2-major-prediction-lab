import type { ReactNode } from 'react'

/**
 * Every page's frame, so all pages share one rhythm: the same header and the same space between
 * sections. Pages never write their own `<h1>` or top-level gap (`lib/pages.test.ts` checks this).
 */
export function Page(props: {
  children: ReactNode
  /** `article` for long reading pages (Methodology). */
  as?: 'div' | 'article'
  /** Extra classes, e.g. a reading width. Never a different gap. */
  className?: string
  /** True while a simulation runs: predicted numbers pulse (theme.css). */
  rough?: boolean
}) {
  const { children, as: Tag = 'div', className = '', rough } = props
  return (
    <Tag className={`flex flex-col gap-8 ${className}`} data-rough={rough || undefined}>
      {children}
    </Tag>
  )
}

/**
 * The page title block: an optional small label above, the title, one line or short paragraph
 * under it, then page-level extras (freshness bar, legend, errors) a little further down.
 */
export function PageHeader(props: {
  title: ReactNode
  /** Small label above the title (the organizer on the overview). */
  kicker?: ReactNode
  /** Dates and status, or a short description. */
  subtitle?: ReactNode
  /** A small uppercase tag under the subtitle (e.g. "Soon", "Planned"). */
  tag?: ReactNode
  children?: ReactNode
}) {
  const { title, kicker, subtitle, tag, children } = props
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {kicker && (
          <p className="font-display text-xs font-semibold uppercase tracking-wider text-ink-3">
            {kicker}
          </p>
        )}
        <h1 className="font-display text-5xl font-bold leading-none tracking-tight">{title}</h1>
        {subtitle && <p className="num max-w-prose text-sm text-ink-2">{subtitle}</p>}
        {tag && <p className="text-xs uppercase tracking-wider text-ink-3">{tag}</p>}
      </div>
      {children}
    </header>
  )
}
