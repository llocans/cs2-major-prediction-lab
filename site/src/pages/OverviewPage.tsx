import { Page, PageHeader } from '../components/Page.tsx'
import type { EventData } from '../lib/data.ts'
import { shortDate } from '../lib/format.ts'

export function OverviewPage({ event }: { event: EventData }) {
  const { config } = event
  return (
    <Page>
      <PageHeader kicker={config.organizer} title={config.name} />
      <ol className="divide-y divide-rule border-y border-rule">
        {config.stages.map((stage) => {
          const href = stage.type === 'swiss' ? `#/stage/${stage.id}` : '#/playoffs'
          const results = event.results.matches.filter((m) => m.stageId === stage.id).length
          return (
            <li key={stage.id}>
              <a href={href} className="flex items-baseline gap-4 py-3 hover:bg-paper-2">
                <span className="w-28 font-display text-xl font-semibold">{stage.name}</span>
                <span className="num w-32 text-sm text-ink-2">
                  {shortDate(stage.start)}–{shortDate(stage.end)}
                </span>
                <span className="text-sm text-ink-3">
                  {stage.type === 'swiss'
                    ? `Swiss, ${stage.format.default === stage.format.decider ? `all ${stage.format.default.toUpperCase()}` : `${stage.format.default.toUpperCase()} / ${stage.format.decider.toUpperCase()} deciders`}`
                    : `Single elimination, ${stage.format.final.toUpperCase()} final`}
                  {results > 0 && ` · ${results} results`}
                </span>
              </a>
            </li>
          )
        })}
      </ol>
      <p className="text-sm text-ink-3">Map pool: {config.mapPool.map((m) => m.name).join(', ')}</p>
    </Page>
  )
}
