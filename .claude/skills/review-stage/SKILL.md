---
name: review-stage
description: Score a finished CS2 stage, Swiss or playoffs (Brier, calibration, market benchmark), write lessons in accuracy.md, and propose capped model changes through a pull request.
model: sonnet
effort: high
disable-model-invocation: true
allowed-tools: Read, Edit, Grep, Glob, Agent, Bash(node scripts/score-stage.ts:*), Bash(node scripts/simulate.ts:*), Bash(node scripts/replay-stage.ts:*), Bash(npm run check), Bash(npm run validate), Bash(git:*), Bash(gh pr create:*)
---

# review-stage

Input: event ID and stage ID. Run only when every match of the stage is in `results.json`
(`data/events/<id>/status.md` says "finished"); otherwise say so and stop.

## Steps
1. `node scripts/score-stage.ts <event> <stage>` writes the generated score block in
   `data/events/<id>/accuracy.md`.
2. Read the block, the stage's snapshots and `docs/model.md`. Write 3-6 short **Lessons** under the
   block: where the model was over/under-confident, which inputs (map offsets, cold start, modifiers)
   helped or hurt, and what to watch next stage. A Swiss stage has 33 matches and the playoffs 8, both
   small samples: say how confident each lesson is. After the playoffs, also look back over the whole
   event (all stages' blocks) and say what to change before the next Major.
3. Commit `accuracy.md` straight to main (`data: review <stage>`).
4. **Parameter proposals** (optional): only if a lesson clearly points at a parameter.
   - Each weight may move at most `retuneCapPerStage` (10%) of its value per stage (docs/model.md).
   - Make the change on a branch `model/<stage>-review` as a new model version for the next stage
     (`docs/model.md`, "Model versions": archive the old params, bump `version`, the next stage's
     `model` runs the new version with the old one alongside). Show
     `node scripts/replay-stage.ts <event> <stage> <old> <new>` in the PR, run `npm run check`, and
     ask the `reviewer` subagent for an independent look.
   - A change to rating rules (`prior`, `maps`, `update`, `scale`) cannot run alongside the old
     version yet (both share one ratings file). Say so in the PR and leave it for the user to decide.
   - Open a PR with a plain-language summary: what changes, why, the expected effect, and the
     reviewer's verdict. Never merge it; the user decides.
5. Reply in 5 lines or fewer: Brier vs coin flip (and vs market if available), the main lesson, and
   the PR link if one was opened.
