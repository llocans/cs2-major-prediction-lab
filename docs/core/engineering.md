# Engineering principles

Protected file. Change it only on a `core/*` branch with a PR.

## Principles

- **KISS and YAGNI.** The simplest solution that works. Build for planned growth (see the routes in
  design.md), not imagined features.
- **Layers.** Four layers, each with one job:
  - `engine/`: pure logic (Swiss, veto, ratings, simulation, scoring). Never touches files, network or UI.
  - `data/`: JSON + Markdown files and their Zod schemas (`data/schemas/`). The only data store.
  - `scripts/`: I/O and automation (fetch, log results, snapshot, validate). Calls the engine.
  - `site/`: React UI. Reads `data/` at build time, runs the engine in a Web Worker.
- **DRY.** One source of truth for every piece of data and every rule. Formats live in event config;
  file shapes live in `data/schemas/`; the path → schema map lives in `data/schemas/index.ts`.
- **Pure and deterministic engine.** Same input + same seed = same output. Randomness only via
  `engine/rng.ts`. Side effects only at the edges (scripts, site).
- **Strict TypeScript, no `any`.** Validate all data at boundaries with Zod (`readJson`, `writeJson`).
- **Small modules.** One concept per file, clear names, small components.
- **Tests** for all engine logic, including replays of real Major brackets (`engine/**/fixtures/`).
- **Errors are explicit.** Throw with context (file, field, value). Never swallow an error; a catch either
  handles a specific case or rethrows.
- **Clear over clever.** Code should read like a senior engineer wrote it.

## Workflow

- Conventional commits: `feat:`, `fix:`, `data:`, `refactor:`, `docs:`, `chore:`, `test:`. Small and focused.
- Data scripts run all checks and commit straight to `main`. Code, docs and model parameter changes go to
  a branch with a PR. `docs/core/` changes only via a `core/*` branch (enforced by a hook).
- `npm run check` (typecheck + lint + tests) must pass before any commit of code.
- No secrets in the repo. `.env` is gitignored; `.env.example` lists the variables.

## Runtime

- Node 24+ runs `.ts` files directly (native type stripping). Scripts and hooks run as
  `node scripts/<name>.ts`, so code uses only erasable TypeScript syntax (`erasableSyntaxOnly`: no enums,
  no parameter properties, no namespaces) and imports with explicit `.ts` extensions.

## Dependencies

Every dependency has a one-line reason. Add one only when it solves a real problem the stack can't.

| Package                                     | Why                                                 |
| ------------------------------------------- | --------------------------------------------------- |
| react, react-dom                            | UI framework (decided stack)                        |
| zod                                         | Runtime validation of every data file at boundaries |
| vite, @vitejs/plugin-react                  | Dev server and static build                         |
| tailwindcss, @tailwindcss/vite              | Styling with our own theme tokens only              |
| typescript                                  | Strict type checking (`tsc --noEmit`)               |
| vitest                                      | Unit and replay tests                               |
| @biomejs/biome                              | Lint + format in one fast tool                      |
| @types/node, @types/react, @types/react-dom | Type definitions                                    |

Not used, on purpose: tsx (Node runs TypeScript natively), routers (a small hash router covers the
static site), state libraries, component kits, chart libraries, databases, Docker.
