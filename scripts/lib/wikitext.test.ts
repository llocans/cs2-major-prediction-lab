import { describe, expect, it } from 'vitest'
import { readBracketPage } from './liquipedia-results.ts'
import { matchWinner, parseBracketMatches } from './wikitext.ts'

// Shape of a Liquipedia Bracket/4 template with a third-place match (trimmed).
const text = `{{Bracket|Bracket/4|id=abc
|R1M1={{Match
	|opponent1={{TeamOpponent|vit}}|opponent2={{TeamOpponent|navi}}
	|finished=true
	|map1={{Map|map=Inferno|finished=true|t1firstside=ct|t1t=7|t1ct=6|t2t=5|t2ct=5}}
	|map2={{Map|map=Nuke|finished=true|t1t=6|t1ct=7|t2t=4|t2ct=3|o1t1t=3|o1t1ct=1|o1t2t=1|o1t2ct=1}}
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

  it('reads regulation rounds per side and the first side; overtime only in the totals', () => {
    const [inferno, nuke] = matches[0]?.maps ?? []
    expect(inferno?.sides).toEqual({ ct1: 6, t1: 7, ct2: 5, t2: 5, firstSide1: 'ct' })
    expect(nuke).toMatchObject({ score1: 17, score2: 9, sides: { ct1: 7, t1: 6, ct2: 3, t2: 4 } })
    expect(nuke?.sides?.firstSide1).toBeUndefined()
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
      'nuke 17-9',
    ])
    expect(results[0]?.maps[0]?.sides).toEqual({ aCt: 6, aT: 7, bCt: 5, bT: 5, aFirstSide: 'ct' })
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

describe('parseTeamLogoLines', () => {
  it('reads light and dark logo files, or one file for both themes', async () => {
    const { parseTeamLogoLines } = await import('./wikitext.ts')
    const text = [
      'nip=<span class="team-template-team-short"><span class="team-template-image-icon team-template-lightmode">[[File:Ninjas in Pyjamas 2021 lightmode.png|100x50px|link=Ninjas in Pyjamas|Ninjas in Pyjamas]]</span><span class="team-template-image-icon team-template-darkmode">[[File:Ninjas in Pyjamas 2021 darkmode.png|100x50px|link=Ninjas in Pyjamas|Ninjas in Pyjamas]]</span> <span class="team-template-text">[[Ninjas in Pyjamas|NIP]]</span></span>',
      'parivision=<span class="team-template-team-short"><span class="team-template-image-icon">[[File:PARIVISION allmode.png|100x50px|link=PARIVISION|PARIVISION]]</span> <span class="team-template-text">[[PARIVISION|PV]]</span></span>',
      'same=<span class="team-template-image-icon team-template-lightmode">[[File:X.png|100x50px]]</span><span class="team-template-image-icon team-template-darkmode">[[File:X.png|100x50px]]</span>',
      'broken=<span class="error">unknown team</span>',
    ].join('\n')
    const result = parseTeamLogoLines(text)
    expect(result.get('nip')).toEqual({
      light: 'Ninjas in Pyjamas 2021 lightmode.png',
      dark: 'Ninjas in Pyjamas 2021 darkmode.png',
    })
    expect(result.get('parivision')).toEqual({
      light: 'PARIVISION allmode.png',
    })
    expect(result.get('same')).toEqual({ light: 'X.png' })
    expect(result.has('broken')).toBe(false)
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
