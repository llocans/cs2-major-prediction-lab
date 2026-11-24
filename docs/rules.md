# Tournament rules

Encoded in `data/events/<id>/config.json`; the engine reads them from there. Every rule cites a source.

Sources:

- **[V]** Valve, _Major Supplemental Rulebook_,
  github.com/ValveSoftware/counter-strike_rules_and_regs/blob/main/major-supplemental-rulebook.md (retrieved 2026-11-21)
- **[LP]** Liquipedia, _PGL/2026/Singapore_ and its stage pages (CC-BY-SA 3.0, retrieved 2026-11-21)
- **[S]** Strafe, _PGL Singapore Major 2026: Format, Teams, Schedule and Opening Matches_ (retrieved 2026-11-21)
- **[D2]** Dust2.us, _PGL adds third-place decider match to Singapore Major_ (retrieved 2026-11-21)
- **[P]** pley.gg, _PGL Major Singapore 2026_ (retrieved 2026-11-21)
- **[VA]** Valve, official Counter-Strike account on X, 4 Nov 2025: CS2 Majors now have Bo5 grand finals,
  starting with the StarLadder Budapest Major 2025. Quoted in Dot Esports, _CS2 Majors to feature
  long-requested grand final format_ (retrieved 2026-11-24)

## Event structure (PGL Major Singapore 2026)

| Stage    | Dates                               | Teams                   | Format                                                                       | Source        |
| -------- | ----------------------------------- | ----------------------- | ---------------------------------------------------------------------------- | ------------- |
| Stage 1  | Nov 24-27                           | 16                      | Swiss, elim/adv Bo3, rest Bo1                                                | [V] [LP]      |
| Stage 2  | Nov 28-Dec 1                        | 8 survivors + 8 invites | Swiss, elim/adv Bo3, rest Bo1                                                | [V] [LP]      |
| Stage 3  | Dec 2-6                             | 8 survivors + 8 invites | Swiss, **all Bo3**                                                           | [LP] [S]      |
| Playoffs | Dec 10-13, Singapore Indoor Stadium | 8                       | Single elim, Bo3, **Bo5 grand final**, **Bo3 third-place decider** on Dec 13 | [VA] [LP] [D2] |

Stage 1 match times: round 1 starts 12:00 SGT (05:00 CET) on Nov 24; rounds 1 and 2 are both on Nov 24,
round 3 on Nov 25, round 4 on Nov 26, round 5 on Nov 27 [LP].

## Swiss stage [V]

- Teams play opponents with the same W-L record. 3 wins advance, 3 losses eliminate.
- Elimination and advancement matches are Bo3; all other matches Bo1 (unless the stage overrides it).
  In practice: round 3 at 2-0 and 0-2, round 4 at 2-1 and 1-2, round 5 at 2-2 are Bo3; round 3 at 1-1 is Bo1
  (confirmed by the Singapore Stage 1 page [LP]).
- No rematches within a stage, if possible.
- Round 1 by initial seed: 1v9, 2v10, 3v11, 4v12, 5v13, 6v14, 7v15, 8v16.
- Rounds 2 and 3: the highest seeded team faces the lowest seeded team available that does not result in a
  rematch.
- Later rounds: use the table below and pick the top-most row that does not result in a rematch.

| Priority |     |     |     |
| :------: | --: | --: | --: |
|    1     | 1v6 | 2v5 | 3v4 |
|    2     | 1v6 | 2v4 | 3v5 |
|    3     | 1v5 | 2v6 | 3v4 |
|    4     | 1v5 | 2v4 | 3v6 |
|    5     | 1v4 | 2v6 | 3v5 |
|    6     | 1v4 | 2v5 | 3v6 |
|    7     | 1v6 | 2v3 | 4v5 |
|    8     | 1v5 | 2v3 | 4v6 |
|    9     | 1v3 | 2v6 | 4v5 |
|    10    | 1v3 | 2v5 | 4v6 |
|    11    | 1v4 | 2v3 | 5v6 |
|    12    | 1v3 | 2v4 | 5v6 |
|    13    | 1v2 | 3v6 | 4v5 |
|    14    | 1v2 | 3v5 | 4v6 |
|    15    | 1v2 | 3v4 | 5v6 |

### Mid-stage seeding [V]

After round 1, seed is determined in order by:

1. Current W-L record in the stage
2. Difficulty Score in the current stage
3. Initial seed of the current stage

**Difficulty Score** = the sum of current wins minus the sum of current losses of every opponent the team
has faced in this stage. Example from [V]: opponents at 2-0 and 1-1 give 3 − 1 = 2. (Liquipedia calls it
"Buchholz", but it is not chess Buchholz.)

### Engine choices where the rulebook is silent

- If no pairing avoids a rematch in rounds 2-3, the engine backtracks to the most preferred pairing that
  avoids rematches; only if none exists does it allow one. In later rounds with no clean table row, the
  top-most row with the fewest rematches is used. Neither case occurs in the replayed Majors (Austin 2025
  and Cologne 2026: all 30 rounds reproduce the real pairings).
- The real draw wins over the engine's. When the Liquipedia stage page lists the current round's
  pairings, the simulation uses them together with that round's matches already played (a live page
  lists only the unplayed ones), as long as together they pair every active team once. Otherwise (no
  draw published yet, a page half edited) the engine's pairing is used, and a pre-round snapshot saved
  then keeps it (snapshots are never edited).

## Stage seeding [V]

- Pre-event seeding: all 32 teams sorted by VRS global standing.
- Stage 1: pre-event seeds. Stages 2 and 3: invited teams are seeds 1-8 (pre-event order), advancing teams
  are seeds 9-16 using their final seed from the previous stage. Playoffs: final Stage 3 seeds.

## Playoffs [V] [LP]

- Bracket A: 1v8, 4v5. Bracket B: 2v7, 3v6. Bo3; grand final Bo5 (Valve, all Majors since Budapest 2025 [VA]). Third-place decider Bo3 (PGL).

## Map veto [V]

**Bo1.** Higher seed chooses Team A or B. A removes 2, B removes 3, A removes 1. B chooses the starting side
on the remaining map.

**Bo3.** Higher seed chooses Team A or B. A bans, B bans, A picks map 1 (B picks side), B picks map 2
(A picks side), B bans, A bans, the remaining map is the decider (B picks side).

**Bo5 (grand final).** The Bo5 final itself is Valve's rule for every Major [VA]. Its map veto is
UNVERIFIED (`veto.bo5.unverified: true`): Valve's rulebook still describes only Bo1 and Bo3 vetoes and
still says all playoff matches are Bo3 (checked at commit `621b7d9`, 2026-11-24), and neither Liquipedia
nor PGL publishes the Singapore Bo5 veto. Config uses PGL's own Bo5 grand-final
practice: at PGL Cluj-Napoca 2026 (HLTV match 2389987, Feb 22, 2026) Team A removed 1, Team B removed 1,
A picked map 1, B picked map 2, A picked map 3, B picked map 4, and the last map was map 5 (decider).
We assume the higher seed chooses Team A or B, as in Bo1 and Bo3. Replace with PGL's Singapore rules
when published and remove the flag.

## Map pool [V] [LP] [P]

Active Duty: Ancient, Anubis, Cache, Dust II, Inferno, Mirage, Nuke (Cache replaced Overpass).
