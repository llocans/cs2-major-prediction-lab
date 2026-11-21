/**
 * SessionStart hook: prints the newest event status.md so every session starts with the current state.
 * Output on stdout is added to Claude's context. Silent if there is no status yet.
 */
import { globSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const files = globSync('data/events/*/status.md', { cwd: projectDir })
  .map((file) => ({ file, mtime: statSync(join(projectDir, file)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)

const newest = files[0]
if (newest) {
  const text = readFileSync(join(projectDir, newest.file), 'utf8')
  process.stdout.write(`Current event status (${newest.file}):\n\n${text.slice(0, 4000)}`)
}
