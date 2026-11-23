import type { ReactNode } from 'react'
import { type EventData, params } from '../lib/data.ts'
import { pct } from '../lib/format.ts'

/**
 * How the numbers on this site are made. Parameter values are read from data/model/params.json and
 * the event config, so the page never drifts from the model. The full spec is docs/model.md.
 */
export function MethodologyPage({ event }: { event: EventData }) {
  const { prior, maps, update, sim, scale } = params
  const standardError = 50 / Math.sqrt(sim.runs)
  // Worked example: two teams 100 rating points apart on a map, typical uncertainty.
  const gap = 100
  const sigma = Math.sqrt(2 * prior.rd ** 2 + 2 * (maps.newMapRd / 2) ** 2)
  const q = Math.LN10 / scale
  const g = 1 / Math.sqrt(1 + (3 * q ** 2 * sigma ** 2) / Math.PI ** 2)
  const mapP = 1 / (1 + 10 ** ((-g * gap) / scale))
  const bo3P = mapP ** 2 * (3 - 2 * mapP)
  const swiss = event.config.stages.filter((s) => s.type === 'swiss')
  const playoffs = event.config.stages.find((s) => s.type === 'single-elimination')

  return (
    <article className="flex max-w-[72ch] flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-5xl font-bold leading-none tracking-tight">Methodology</h1>
        <p className="text-sm text-ink-2">
          How the probabilities on this site are made, where the data comes from and how it stays
          current. Every number is model output from public data, not advice. The full
          specification, with every formula, is <Code>docs/model.md</Code> in the repository.
        </p>
      </header>

      <Section title="In one paragraph">
        <p>
          Every team gets a strength rating for each map. Before a match the model plays out the map
          veto, turns the rating gaps on the chosen maps into map win chances, and combines them
          into a match win chance. It then plays the rest of the tournament{' '}
          {sim.runs.toLocaleString('en-US')} times, following the official Swiss pairing rules and
          the playoff bracket, and counts how often each team advances, goes 3-0 or 0-3, reaches the
          playoffs or wins the title. Real results replace simulated ones as soon as they are known,
          and every result also updates the ratings.
        </p>
      </Section>

      <Section title="Where the data comes from">
        <Table
          head={['Source', 'What we take', 'How']}
          rows={[
            [
              'Valve Regional Standings (VRS)',
              'Each team’s points at the invite cutoff: the starting rating. Also the match tables used to spot teams with few top-level games.',
              'Valve’s public GitHub repository',
            ],
            [
              'HLTV',
              'Map win-loss counts per team against top-50 opponents over the last three months.',
              'Read by hand before the event, each figure stored with its URL and date',
            ],
            [
              'Liquipedia',
              'Rosters, the stage pages (pairings and results) and the playoff bracket.',
              'Official MediaWiki API, at most one request every 2 seconds, CC-BY-SA',
            ],
            [
              'News and team research',
              'Roster changes, stand-ins, visa or illness news.',
              'Written into team notes; only capped, expiring modifiers reach the model',
            ],
            [
              'Bookmaker odds',
              'Win chances for upcoming matches, with the bookmaker margin removed.',
              'Collected before a round, a benchmark only, never a model input',
            ],
          ]}
        />
        <p>
          Every stored fact carries its source and the date it was read. Nothing is filled in from
          memory.
        </p>
      </Section>

      <Section title="How results arrive">
        <p>
          A small program, the <em>poller</em>, runs on GitHub’s servers every 15 minutes (at :02,
          :17, :32 and :47) from the day before a stage until the day after it. It does not need
          anyone’s computer to be on. Each check:
        </p>
        <Steps
          items={[
            'reads the current stage page from Liquipedia;',
            'records any newly finished match (teams, maps, scores, winner);',
            'updates both teams’ ratings from the maps they played;',
            're-runs the simulation and rewrites the current odds;',
            'when a round is complete, saves the prediction for the next round before it starts;',
            'when a stage is complete, moves its eight advancing teams into the next stage;',
            'checks every data file and saves the change to the project’s repository, where this site reads it.',
          ]}
        />
        <p>
          If Liquipedia already shows the next round’s official draw, the model uses it instead of
          its own pairing. The bar above the stage bracket says whether the numbers are current:{' '}
          <strong>Live</strong> (a check arrived within 45 minutes), <strong>Waiting</strong> (no
          stage running) or <strong>Problem</strong> (the last check failed or none arrived).
        </p>
        <p>
          A few judgment tasks run on a schedule as well: a daily search for roster and stand-in
          news, a review after each stage, and a weekly tidy-up of expired notes.
        </p>
      </Section>

      <Section title="Ratings">
        <p>
          A rating is a number on the same scale Valve uses: a gap of {scale} points means 10-to-1
          odds. It starts from VRS points:
        </p>
        <Formula>
          rating = {prior.base} + {prior.perVrsPoint} × (VRS points − {prior.vrsCenter})
        </Formula>
        <p>
          VRS measures whole series, while we model single maps, so the gap is scaled down a little.
          Each team also has an uncertainty: {prior.rd} points normally, {prior.coldStartRd} for
          teams with fewer than {prior.coldStartSeries} recent series against top-50 opponents. More
          uncertainty pulls a prediction toward 50%.
        </p>
        <p>
          On top of the team rating, each map has its own offset from the team’s map record. Small
          samples are shrunk toward the team’s overall record (as if {maps.shrinkMaps} extra average
          maps had been played), offsets are capped at ±{maps.maxOffset}, and a map a team never
          plays in a large sample counts as its likely permanent ban.
        </p>
        <p>
          After every real match each map played moves the ratings by up to {update.k} points times
          the surprise (a map the model gave 80% moves little when won, a lot when lost). Bo1 maps
          count {update.formatWeight.bo1} of a Bo3 map, and a wide round score counts a bit more
          than a close one.
        </p>
      </Section>

      <Section title="From ratings to a match">
        <p>
          <strong>Veto.</strong> The model follows the event’s exact ban and pick order. Each team
          bans the maps it is weakest on relative to the opponent and picks the ones it is strongest
          on, with some randomness (a temperature of {params.veto.temperature} points) because real
          vetoes are not perfectly predictable. Sides (CT/T) are not modeled.
        </p>
        <p>
          <strong>Map.</strong> The win chance on a map comes from the rating gap including map
          offsets, flattened by the combined uncertainty. Example: a {gap}-point gap with typical
          uncertainty gives <span className="num text-accent">{pct(mapP)}</span> on that map.
        </p>
        <p>
          <strong>Series.</strong> Maps are played one by one in the simulation. If every map were
          the same {pct(mapP)}, a Bo3 would be won{' '}
          <span className="num text-accent">{pct(bo3P)}</span> of the time: a better team gains more
          over three maps than over one.
        </p>
      </Section>

      <Section title="What the percentages mean">
        <p>
          All odds are shares of {sim.runs.toLocaleString('en-US')} simulated tournaments (a fixed
          random seed, so the same data always gives the same numbers). The statistical noise is at
          most about {standardError.toFixed(2)} percentage points.
        </p>
        <Table
          head={['Column', 'Meaning']}
          rows={[
            ['Match %', 'Chance the named team wins that match, veto and all maps included.'],
            ['3-0', 'Advances from the stage without losing a match.'],
            ['Advance', 'Reaches 3 wins in the Swiss stage.'],
            ['0-3', 'Eliminated without winning a match.'],
            [
              'Playoffs',
              'Reaches the playoffs, with all later Swiss stages simulated too (teams entering later stages are seeded as the rules say).',
            ],
            ['Title', 'Wins the Major.'],
            [
              'Confidence',
              'High when the ratings are well known and the gap is clear; low when either team is uncertain or the match is near 50-50.',
            ],
          ]}
        />
        <p>
          Predictions are in the <span className="text-accent">accent color</span>; real results are
          in plain text. On a stage page you can click a prediction to force a winner and see how
          everything else moves. Those what-ifs live only in the page address and never change the
          saved data.
        </p>
        <p>Formats follow this event’s rules:</p>
        <Steps
          items={[
            ...swiss.map((s) =>
              s.format.default === s.format.decider
                ? `${s.name}: Swiss, every match ${s.format.default.toUpperCase()}.`
                : `${s.name}: Swiss, ${s.format.default.toUpperCase()}, with ${s.format.decider.toUpperCase()} when a team can advance or be eliminated.`,
            ),
            ...(playoffs
              ? [
                  `${playoffs.name}: single elimination, ${playoffs.format.default.toUpperCase()} with a ${playoffs.format.final.toUpperCase()} final.`,
                ]
              : []),
          ]}
        />
      </Section>

      <Section title="Keeping score">
        <p>
          Before every round, the predictions are saved and never edited afterwards. The Track
          record page compares them with what happened using the Brier score (the average squared
          error of the probabilities: 0 is perfect, 0.250 is what always saying 50% scores).
        </p>
        <p>
          The comparison includes the betting market. For each match, odds from about ten bookmakers
          are converted to probabilities, each bookmaker’s margin is removed, and the results are
          averaged. The market is a yardstick, never an input: the model does not look at it.
        </p>
      </Section>

      <Section title="Judgment and its limits">
        <p>
          Human judgment (a stand-in, a player’s illness) can enter only as a logged modifier: at
          most ±{params.modifiers.maxAbs} rating points, with a source and an expiry date. After a
          stage, no model parameter may move by more than{' '}
          {Math.round(params.retuneCapPerStage * 100)}% until the model has been tested on past
          Majors.
        </p>
        <Steps
          items={[
            'Parameters are set by reasoning, not yet fitted on past Majors.',
            'Map statistics cover three months and top-50 opponents only.',
            'CT and T sides, player form within the event and travel are not modeled.',
            'The Bo5 final’s veto copies the previous PGL Major until the organizer confirms it.',
          ]}
        />
      </Section>
    </article>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 text-sm leading-relaxed text-ink">
      <h2 className="border-b border-ink pb-1 font-display text-2xl font-bold">{title}</h2>
      {children}
    </section>
  )
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-sm bg-paper-2 px-1 text-[0.85em]">{children}</code>
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <p className="num overflow-x-auto rounded-sm bg-paper-2 px-3 py-2 font-display text-base">
      {children}
    </p>
  )
}

function Steps({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-ink-2">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-ink">
            {head.map((cell) => (
              <th key={cell} className="py-1.5 pr-4 align-bottom font-semibold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-b border-rule align-top">
              {row.map((cell, index) => (
                <td
                  key={cell}
                  className={`py-1.5 pr-4 ${index === 0 ? 'font-semibold whitespace-nowrap' : 'text-ink-2'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
