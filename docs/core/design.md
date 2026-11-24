# Design rules

Protected file. Change it only on a `core/*` branch with a PR.

## Character

Sports-graphics typography on paper. Clean and minimal, easy to read, never a generic template look.
Hierarchy comes from type size, weight, spacing and alignment, not from boxes and color.

## Hard rules

- No gradients, no glow, no emoji (plain text marks like ✓ ✗ are fine), no decorative shadows. Radius is small (2-4 px).
- Only our theme tokens exist: Tailwind's default color palette is removed (`--color-*: initial`).
- One accent color. It marks predictions and the selected item. Real results use ink, never the accent.
- Numbers are tabular (`font-variant-numeric: tabular-nums`) and right-aligned in tables.
- Light and dark themes follow the system setting until the viewer picks one with the switch in the
  nav (saved in the browser). Both use the same tokens.
- Bracket lines and connectors are SVG using the same tokens. In the Swiss bracket, the line to where
  a group's winners go is `win` and the line to where its losers go is `loss`, each ending in an
  arrow: solid once the group is played, dashed while it is still predicted.

## Tokens (defined in `site/src/theme.css`)

- Colors: `paper`, `paper-2` (subtle fill), `ink`, `ink-2` (secondary), `ink-3` (muted), `rule` (lines),
  `accent`, `accent-ink` (text on accent), `win`, `loss` (muted, used sparingly for W/L marks, the model's pick marks, the Swiss bracket's winner/loser
  connectors and its Advanced/Eliminated boxes, and the up/down change of a chance since round 1).
- Fonts: a condensed sans for headings and numbers, a neutral sans for text, both self-hosted or
  system fallbacks.
- Spacing on a 4 px grid. Radius: `sm` 2 px, `md` 4 px.

## Real vs predicted

- Real result: solid ink, bold winner, score shown.
- Predicted: accent color, the probability shown as a percentage, a dashed connector in the bracket.
- User override: marked "override" in small caps and reflected in the URL.
- Model's pick on a finished match: the favourite's pre-match % stays on its row, `win` with ✓ if it
  won, `loss` crossed out with ✗ if it lost, `ink-3` with no mark under 55% (a coin flip). The colour
  sits only on the pick, never on the whole match, so a losing team is never green.

## Team names

- The event's team names in headings, the bracket and tables; short names (Liquipedia's `TeamShort`,
  e.g. NIP, LVG) in running text and tight spots. Never a third, longer variant.
- Team logos (from Liquipedia, light and dark versions) sit before the name in tables, brackets,
  Pick'Em and the team panel heading, in a fixed box so names line up. Never in running text, never
  instead of the name, never recoloured or dimmed.

## Behaviour

- The simulation never blocks the UI (Web Worker). While it runs, predicted numbers on screen turn
  grey (`ink-3`) and an orange "Simulating changes…" badge shows; orange numbers always mean final.
  Finished results are cached in the browser, so an unchanged page shows final odds at once.
- Works on desktop and mobile (375 px wide, no horizontal page scroll).
- Data and results are shown in the UI; chat replies stay short.

## Routes

`#/` event overview · `#/stage/:id` stage (v1 view) · `#/playoffs` · `#/team/:id` ·
`#/match/:a/:b` · `#/pickem/:stage` · `#/market/:stage` (model vs a bookmaker) · `#/track-record` ·
`#/odds` (odds over time) · `#/methodology`

Built: overview, stage, playoffs, Pick'Em, market odds, track record, methodology. The others exist as placeholders (`docs/roadmap.md`).
