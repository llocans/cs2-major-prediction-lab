import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ZodType, z } from 'zod'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export function repoPath(...parts: string[]): string {
  return join(repoRoot, ...parts)
}

export function toRepoRelative(absolutePath: string): string {
  return relative(repoRoot, absolutePath).split('\\').join('/')
}

export class DataError extends Error {
  override name = 'DataError'
}

/** Reads a JSON file and validates it. Throws DataError with the path and Zod issues. */
export function readJson<S extends ZodType>(path: string, schema: S): z.output<S> {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new DataError(`${toRepoRelative(path)}: cannot read JSON (${String(error)})`)
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new DataError(`${toRepoRelative(path)}: schema validation failed\n${issues}`)
  }
  return parsed.data
}

/** Validates, then writes pretty JSON. `exclusive` refuses to overwrite (used for snapshots). */
export function writeJson<S extends ZodType>(
  path: string,
  schema: S,
  value: z.input<S>,
  options: { exclusive?: boolean } = {},
): void {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new DataError(`${toRepoRelative(path)}: refusing to write invalid data\n${parsed.error}`)
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(parsed.data, null, 2)}\n`, {
    encoding: 'utf8',
    flag: options.exclusive ? 'wx' : 'w',
  })
}
