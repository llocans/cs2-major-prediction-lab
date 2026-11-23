# Design rules

Protected file. Change it only on a `core/*` branch with a PR.

## Character

Sports-graphics typography on paper. Clean and minimal, easy to read, never a generic template look.
Hierarchy comes from type size, weight, spacing and alignment, not from boxes and color.

## Hard rules

- No gradients, no glow, no emoji, no decorative shadows. Radius is small (2-4 px).
- Only our theme tokens exist: Tailwind's default color palette is removed (`--color-*: initial`).
- One accent color. It marks predictions and the selected item. Real results use ink, never the accent.
- Numbers are tabular (`font-variant-numeric: tabular-nums`) and right-aligned in tables.
- Light and dark themes follow the system setting. Both use the same tokens.
- Bracket lines and connectors are SVG using the same tokens.

## Tokens (defined in `site/src/theme.css`)

- Colors: `paper`, `paper-2` (subtle fill), `ink`, `ink-2` (secondary), `ink-3` (muted), `rule` (lines),
  `accent`, `accent-ink` (text on accent), `win`, `loss` (muted, used sparingly for W/L marks).
- Fonts: a condensed sans for headings and numbers, a neutral sans for text, both self-hosted or
  system fallbacks.
- Spacing on a 4 px grid. Radius: `sm` 2 px, `md` 4 px.

## Real vs predicted

- Real result: solid ink, bold winner, score shown.
- Predicted: accent color, the probability shown as a percentage, a dashed connector in the bracket.
- User override: marked "override" in small caps and reflected in the URL.

## Behaviour

- The simulation never blocks the UI (Web Worker). Show the last result while re-simulating.
- Works on desktop and mobile (375 px wide, no horizontal page scroll).
- Data and results are shown in the UI; chat replies stay short.

## Routes

`#/` event overview · `#/stage/:id` stage (v1 view) · `#/playoffs` · `#/team/:id` ·
`#/match/:a/:b` · `#/track-record` · `#/odds` (odds over time) · `#/methodology`

Built: overview, stage, playoffs, track record, methodology. The others exist as placeholders (`docs/roadmap.md`).
