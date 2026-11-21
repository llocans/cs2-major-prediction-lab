/**
 * Validates every data file against its schema and checks cross-file references.
 * Usage: npm run validate
 */
import { validateAllData } from './lib/validate-data.ts'

const { checked, problems } = validateAllData()
if (problems.length > 0) {
  console.error(`Validation failed (${problems.length} problem(s)):\n${problems.join('\n')}`)
  process.exit(1)
}
console.log(`OK: ${checked} data files valid`)
