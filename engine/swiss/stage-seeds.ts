import type { EventParticipant } from '../../data/schemas/event-teams.ts'

/**
 * Seed order of a stage (index 0 = seed 1): teams entering the stage plus teams that advanced into it.
 * Throws on duplicate seeds. Returns fewer teams than the stage size while earlier stages are running.
 */
export function stageSeeds(participants: readonly EventParticipant[], stageId: string): string[] {
  const seeded: Array<{ teamId: string; seed: number }> = []
  for (const p of participants) {
    if (p.entryStage === stageId) seeded.push({ teamId: p.teamId, seed: p.stageSeed })
    const advanced = p.advancedSeeds?.[stageId]
    if (advanced !== undefined) seeded.push({ teamId: p.teamId, seed: advanced })
  }
  const seen = new Set<number>()
  for (const { seed, teamId } of seeded) {
    if (seen.has(seed)) throw new Error(`${stageId}: seed ${seed} is used twice (${teamId})`)
    seen.add(seed)
  }
  return seeded.sort((a, b) => a.seed - b.seed).map((s) => s.teamId)
}
