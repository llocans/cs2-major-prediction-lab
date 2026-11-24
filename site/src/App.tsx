import { stageSeeds } from '../../engine/swiss/stage-seeds.ts'
import { ThemeToggle } from './components/ThemeToggle.tsx'
import { currentEvent } from './lib/data.ts'
import { type Route, useLocation } from './lib/router.ts'
import { MarketOddsPage } from './pages/MarketOddsPage.tsx'
import { MethodologyPage } from './pages/MethodologyPage.tsx'
import { OverviewPage } from './pages/OverviewPage.tsx'
import { PickemPage } from './pages/PickemPage.tsx'
import { PlaceholderPage } from './pages/PlaceholderPage.tsx'
import { PlayoffsPage } from './pages/PlayoffsPage.tsx'
import { StagePage } from './pages/StagePage.tsx'
import { TrackRecordPage } from './pages/TrackRecordPage.tsx'

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
  { label: "Pick'Em", href: '#/pickem', active: (r) => r.page === 'pickem' },
  { label: 'Market odds', href: '#/market', active: (r) => r.page === 'market' },
  { label: 'Track record', href: '#/track-record', active: (r) => r.page === 'track-record' },
  { label: 'Methodology', href: '#/methodology', active: (r) => r.page === 'methodology' },
]

export function App() {
  const { route, query } = useLocation()
  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-8 px-4 py-6 sm:px-8">
      <nav className="flex flex-wrap items-baseline gap-x-5 border-b border-rule pb-2">
        <a href="#/" className="mr-4 font-display text-sm font-bold uppercase tracking-wider">
          CS2 Prediction Lab
        </a>
        {nav.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`py-1 text-sm ${item.active(route) ? 'font-semibold text-ink underline decoration-accent decoration-2 underline-offset-4' : 'text-ink-2 hover:text-ink'}`}
          >
            {item.label}
          </a>
        ))}
        <ThemeToggle />
      </nav>
      <main className="flex-1">
        <Page route={route} query={query} />
      </main>
      <footer className="mt-12 border-t border-rule pt-3 text-xs text-ink-3">
        Data: Valve Regional Standings, Liquipedia (CC-BY-SA 3.0). Team logos are trademarks of
        their teams. Predictions are model output, not advice.
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
    case 'playoffs': {
      const stage = event.config.stages.find((s) => s.type === 'single-elimination')
      if (stage?.type !== 'single-elimination')
        return <PlaceholderPage title="Playoffs" description="This event has no playoff stage." />
      return <PlayoffsPage event={event} stage={stage} query={query} />
    }
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
      return <TrackRecordPage event={event} />
    case 'odds':
      return (
        <PlaceholderPage
          title="Odds over time"
          description="How each team's chances moved round by round."
        />
      )
    case 'methodology':
      return <MethodologyPage event={event} />
    case 'pickem':
      return <PickemPage event={event} stageId={route.stageId} />
    case 'market':
      return <MarketOddsPage event={event} stageId={route.stageId} />
    case 'not-found':
      return <PlaceholderPage title="Not found" description="This page does not exist." />
  }
}
