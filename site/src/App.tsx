import { stageSeeds } from '../../engine/swiss/stage-seeds.ts'
import { currentEvent } from './lib/data.ts'
import { type Route, useLocation } from './lib/router.ts'
import { OverviewPage } from './pages/OverviewPage.tsx'
import { PlaceholderPage } from './pages/PlaceholderPage.tsx'
import { StagePage } from './pages/StagePage.tsx'

const nav: Array<{ label: string; href: string; active: (route: Route) => boolean }> = [
  { label: 'Overview', href: '#/', active: (r) => r.page === 'overview' },
  ...currentEvent.config.stages
    .filter((s) => s.type === 'swiss')
    .map((s) => ({
      label: s.name,
      href: `#/stage/${s.id}`,
      active: (r: Route) => r.page === 'stage' && r.stageId === s.id,
    })),
  { label: 'Playoffs', href: '#/playoffs', active: (r) => r.page === 'playoffs' },
  { label: 'Track record', href: '#/track-record', active: (r) => r.page === 'track-record' },
  { label: 'Methodology', href: '#/methodology', active: (r) => r.page === 'methodology' },
]

export function App() {
  const { route, query } = useLocation()
  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-8 px-4 py-6 sm:px-8">
      <nav className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-rule pb-3">
        <a href="#/" className="mr-4 font-display text-sm font-bold uppercase tracking-wider">
          CS2 Prediction Lab
        </a>
        {nav.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`text-sm ${item.active(route) ? 'font-semibold text-ink underline decoration-accent decoration-2 underline-offset-4' : 'text-ink-2 hover:text-ink'}`}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <main className="flex-1">
        <Page route={route} query={query} />
      </main>
      <footer className="border-t border-rule pt-3 text-xs text-ink-3">
        Data: Valve Regional Standings, Liquipedia (CC-BY-SA 3.0). Predictions are model output, not
        advice.
      </footer>
    </div>
  )
}

function Page({ route, query }: { route: Route; query: URLSearchParams }) {
  const event = currentEvent
  switch (route.page) {
    case 'overview':
      return <OverviewPage event={event} />
    case 'stage': {
      const stage = event.config.stages.find((s) => s.id === route.stageId)
      if (stage?.type !== 'swiss')
        return <PlaceholderPage title="Unknown stage" description="No such stage." />
      const seeded = stageSeeds(event.teams.participants, stage.id).length
      if (seeded < stage.teamCount) {
        return (
          <PlaceholderPage
            title={stage.name}
            description={`Teams are known once the previous stage ends: ${seeded} of ${stage.teamCount} seeded so far.`}
          />
        )
      }
      return <StagePage key={stage.id} event={event} stage={stage} query={query} />
    }
    case 'playoffs':
      return (
        <PlaceholderPage
          title="Playoffs"
          description="Eight teams, Bo3, a Bo3 third-place decider and a Bo5 grand final."
        />
      )
    case 'team':
      return (
        <PlaceholderPage
          title="Team"
          description="Team pages with research notes, map pool and form."
        />
      )
    case 'match':
      return (
        <PlaceholderPage
          title="Matchup"
          description="Head-to-head view with veto and map probabilities."
        />
      )
    case 'track-record':
      return (
        <PlaceholderPage
          title="Track record"
          description="Snapshots vs results: Brier score and calibration per stage."
        />
      )
    case 'odds':
      return (
        <PlaceholderPage
          title="Odds over time"
          description="How each team's chances moved round by round."
        />
      )
    case 'methodology':
      return (
        <PlaceholderPage
          title="Methodology"
          description="How ratings, veto and simulation work. See docs/model.md for now."
        />
      )
    case 'not-found':
      return <PlaceholderPage title="Not found" description="This page does not exist." />
  }
}
