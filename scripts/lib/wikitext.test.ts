import { describe, expect, it } from 'vitest'
import { readBracketPage } from './liquipedia-results.ts'
import { matchWinner, parseBracketMatches } from './wikitext.ts'

// Shape of a Liquipedia Bracket/4 template with a third-place match (trimmed).
const text = `{{Bracket|Bracket/4|id=abc
|R1M1={{Match
	|opponent1={{TeamOpponent|vit}}|opponent2={{TeamOpponent|navi}}
	|finished=true
	|map1={{Map|map=Inferno|finished=true|t1t=7|t1ct=6|t2t=5|t2ct=5}}
	|map2={{Map|map=Nuke|finished=true|t1t=6|t1ct=7|t2t=4|t2ct=3}}
	|map3={{Map|map=Mirage|finished=skip}}
	}}
|R1M2={{Match
	|opponent1={{TeamOpponent|mouz}}|opponent2={{TeamOpponent|spirit}}
	|map1={{Map|map=Dust II|finished=true|t1t=3|t1ct=2|t2t=9|t2ct=4}}
	|map2={{Map|map=Ancient}}
	|map3={{Map|map=}}
	}}
|R2M1={{Match
	|opponent1={{TeamOpponent|vit}}|opponent2={{TeamOpponent|}}
	|map1={{Map|map=}}|map2={{Map|map=}}|map3={{Map|map=}}|map4={{Map|map=}}|map5={{Map|map=}}
	}}
|RxMTP={{Match
	|opponent1={{TeamOpponent|navi}}|opponent2={{TeamOpponent|mouz}}
	|map1={{Map|map=}}|map2={{Map|map=}}|map3={{Map|map=}}
	}}
}}`

describe('parseBracketMatches', () => {
  const matches = parseBracketMatches(text)

  it('reads rounds, positions and the third-place match, skipping TBD slots', () => {
    expect(
      matches.map(
        (m) => `${m.round}.${m.index}${m.thirdPlace ? 'tp' : ''} ${m.opponent1}-${m.opponent2}`,
      ),
    ).toEqual(['1.0 vit-navi', '1.1 mouz-spirit', '2.0tp navi-mouz'])
  })

  it('reads map slots and finished maps', () => {
    const [first, second, third] = matches
    expect(first?.mapSlots).toBe(3)
    expect(first?.finished).toBe(true)
    expect(first && matchWinner(first)).toBe(1)
    expect(second?.maps).toHaveLength(1)
    expect(second?.finished).toBe(false)
    expect(third?.mapSlots).toBe(3)
  })
})

describe('readBracketPage', () => {
  const source = { name: 'test', retrievedAt: '2026-12-10' }
  const { results, skipped } = readBracketPage(text, {
    stageId: 'playoffs',
    resolveTeam: (name) => name,
    resolveMap: (name) => name.toLowerCase().replace(' ', ''),
    source,
  })

  it('returns finished matches only, with formats from the map slots', () => {
    expect(results.map((r) => `${r.id} ${r.format} ${r.winner}`)).toEqual([
      'playoffs-r1-navi-vit bo3 vit',
    ])
    expect(results[0]?.maps.map((m) => `${m.map} ${m.scoreA}-${m.scoreB}`)).toEqual([
      'inferno 13-10',
      'nuke 13-7',
    ])
    expect(skipped).toEqual([])
  })

  it('reports a match marked finished whose maps decide nothing, and ignores TBD opponents', () => {
    const page = `{{Bracket|Bracket/4|id=y
|R1M1={{Match|opponent1={{TeamOpponent|vit}}|opponent2={{TeamOpponent|navi}}|finished=true
|map1={{Map|map=Inferno|finished=true|t1t=7|t1ct=6|t2t=5|t2ct=5}}
|map2={{Map|map=}}|map3={{Map|map=}}
}}
|R1M2={{Match|opponent1={{TeamOpponent|TBD}}|opponent2={{TeamOpponent|spirit}}
|map1={{Map|map=}}|map2={{Map|map=}}|map3={{Map|map=}}
}}
}}`
    const read = readBracketPage(page, {
      stageId: 'playoffs',
      resolveTeam: (name) => name,
      resolveMap: (name) => name.toLowerCase(),
      source,
    })
    expect(read.results).toEqual([])
    expect(read.skipped).toEqual(['vit v navi: marked finished but its maps decide no winner'])
    expect(parseBracketMatches(page).map((m) => m.opponent1)).toEqual(['vit'])
  })
})

describe('parseTeamShortLines', () => {
  it('reads the short name from the last non-file link of each line', async () => {
    const { parseTeamShortLines } = await import('./wikitext.ts')
    const text = [
      'nip=[[File:NiP lightmode.png|100x50px|link=Ninjas in Pyjamas|Ninjas in Pyjamas]][[File:NiP darkmode.png|link=Ninjas in Pyjamas|Ninjas in Pyjamas]] [[Ninjas in Pyjamas|NIP]]',
      'lynn-vision=<span>[[File:LVG allmode.png|100x50px|link=Lynn Vision Gaming|Lynn Vision Gaming]] [[Lynn Vision Gaming|LVG]]</span>',
      'broken=<span class="error">unknown team</span>',
    ].join('\n')
    const result = parseTeamShortLines(text)
    expect(result.get('nip')).toEqual({ page: 'Ninjas in Pyjamas', short: 'NIP' })
    expect(result.get('lynn-vision')).toEqual({ page: 'Lynn Vision Gaming', short: 'LVG' })
    expect(result.has('broken')).toBe(false)
  })
})
