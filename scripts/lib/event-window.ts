/** Days before a stage starts that the cloud poller's chain stays alive, so it is running on day one. */
export const LEAD_DAYS = 3
/** Days after a stage ends that the chain stays alive (late Liquipedia edits, stage advance). */
export const TRAIL_DAYS = 1

const DAY = 86_400_000

/**
 * True while any stage of the event is within its keep-alive window: from LEAD_DAYS before its start
 * to TRAIL_DAYS after its end (dates are YYYY-MM-DD, compared in UTC). Gaps between stages shorter
 * than LEAD_DAYS + TRAIL_DAYS are therefore covered, so the chain runs from before the first stage
 * to after the last one without depending on GitHub's schedule.
 */
export function isEventWindowOpen(
  stages: ReadonlyArray<{ start: string; end: string }>,
  today: string,
): boolean {
  const now = Date.parse(today)
  return stages.some(
    (stage) =>
      now >= Date.parse(stage.start) - LEAD_DAYS * DAY && now <= Date.parse(stage.end) + TRAIL_DAYS * DAY,
  )
}
