import { existsSync, globSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { missingReferences } from './doc-references.ts'
import { repoPath, repoRoot } from './files.ts'

describe('missingReferences', () => {
  const exists = (path: string) => ['scripts/simulate.ts', 'docs/model.md'].includes(path)

  it('reports a backticked repo path that does not exist', () => {
    const text = 'See `docs/model.md` and `docs/gone.md`.\nRun `node scripts/old.ts <event>`.'
    expect(missingReferences('README.md', text, exists)).toEqual([
      { file: 'README.md', line: 1, reference: 'docs/gone.md' },
      { file: 'README.md', line: 2, reference: 'node scripts/old.ts <event>' },
    ])
  })

  it('resolves script paths relative to scripts/ and skips placeholders and bare names', () => {
    const text =
      '`simulate.ts` `results.json` `data/events/<id>/` `node scripts/<name>.ts` `claude/` `https://x.y/z`'
    expect(missingReferences('CLAUDE.md', text, exists)).toEqual([])
    expect(missingReferences('CLAUDE.md', '`research/missing.ts`', exists)).toHaveLength(1)
  })
})

describe('repository docs', () => {
  it('mention only paths that exist', () => {
    const files = [
      'README.md',
      'CLAUDE.md',
      ...globSync('docs/**/*.md', { cwd: repoRoot }),
      ...globSync('.claude/{skills,agents}/**/*.md', { cwd: repoRoot }),
    ].filter((file) => file !== 'docs/changelog.md')
    const missing = files.flatMap((file) =>
      missingReferences(file, readFileSync(repoPath(file), 'utf8'), (path) =>
        existsSync(repoPath(path)),
      ),
    )
    expect(missing.map((m) => `${m.file}:${m.line} ${m.reference}`)).toEqual([])
  })
})
