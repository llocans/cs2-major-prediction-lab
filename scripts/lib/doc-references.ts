/**
 * Finds file paths that the docs mention in backticks but that no longer exist, so docs drift shows up
 * in `npm run check` instead of in a reader's confusion. Pure: the caller passes an `exists` check.
 *
 * Checked: paths under a top-level folder (`scripts/simulate.ts`, `docs/model.md`, `.claude/skills/x`)
 * and script paths relative to `scripts/` (`research/vrs-form.ts`). Bare file names (`results.json`)
 * depend on context and are skipped, as are placeholders (`<id>`, `*`, `...`).
 */

const TOP_LEVEL = ['scripts', 'docs', 'data', 'engine', 'site', '.claude', '.github']
const PLACEHOLDER = /[<>*{}$:]|\.\.\./

export interface MissingReference {
  file: string
  line: number
  reference: string
}

export function missingReferences(
  file: string,
  text: string,
  exists: (path: string) => boolean,
): MissingReference[] {
  const missing: MissingReference[] = []
  text.split('\n').forEach((content, index) => {
    for (const [, token = ''] of content.matchAll(/`([^`\n]+)`/g)) {
      // Commands such as `node scripts/simulate.ts <event>`: check the path part only.
      const path = (token.replace(/^node (?:--\S+ )*/, '').split(' ')[0] ?? '').replace(/\/$/, '')
      if (!path.includes('/') || PLACEHOLDER.test(path) || !/^[\w./-]+$/.test(path)) continue
      const top = path.split('/')[0] ?? ''
      const candidates = TOP_LEVEL.includes(top)
        ? [path]
        : path.endsWith('.ts')
          ? [`scripts/${path}`]
          : []
      if (candidates.length === 0 || candidates.some(exists)) continue
      missing.push({ file, line: index + 1, reference: token })
    }
  })
  return missing
}
