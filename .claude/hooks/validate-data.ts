/**
 * PostToolUse (Edit|Write). Validates an edited file under data/ against its schema.
 * Exit 2 sends the problems back to Claude so it fixes the file right away.
 */
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { schemaForPath } from '../../data/schemas/index.ts'

interface HookInput {
  cwd?: string
  tool_input?: { file_path?: string }
}

const input = JSON.parse(readFileSync(0, 'utf8')) as HookInput
const filePath = input.tool_input?.file_path
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd
if (!filePath || !projectDir) process.exit(0)

const relativePath = relative(projectDir, filePath).split('\\').join('/')
if (!relativePath.startsWith('data/') || !relativePath.endsWith('.json')) process.exit(0)

const schema = schemaForPath(relativePath)
if (!schema) {
  process.stderr.write(`${relativePath}: no schema registered in data/schemas/index.ts\n`)
  process.exit(2)
}

let raw: unknown
try {
  raw = JSON.parse(readFileSync(filePath, 'utf8'))
} catch (error) {
  process.stderr.write(`${relativePath}: invalid JSON (${String(error)})\n`)
  process.exit(2)
}

const result = schema.safeParse(raw)
if (!result.success) {
  const issues = result.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  process.stderr.write(`${relativePath}: schema validation failed\n${issues}\n`)
  process.exit(2)
}
process.exit(0)
