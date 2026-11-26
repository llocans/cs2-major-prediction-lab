# Model principles

Protected file. Change it only on a `core/*` branch with a PR. The current model spec is `docs/model.md`.

1. **Code does the math; research does the judgment.** Judgment enters only as explicit modifiers in
   `data/model/modifiers.json`: each has a size (capped by `params.modifiers.maxAbs`), a reason, a
   source and an expiry date. Nothing else changes a prediction by hand.
2. **Probabilities, not picks.** Every prediction shows a probability, a confidence level and a short
   reason derived from the inputs that moved it most.
3. **Uncertainty is part of the rating.** Teams with little tier-1 data start with a wider uncertainty,
   which pulls their predictions toward 50%.
4. **Map level.** Matches are simulated map by map through the event's real veto procedure.
5. **Reproducible.** Simulations are seeded. A snapshot records the model version, seed and run count.
6. **Honest scoring.** Snapshots are saved before each round and never edited. Each stage is scored with
   the Brier score and calibration, against simple baselines and the market benchmark.
7. **Slow, evidence-based tuning.** One Swiss stage (33 matches) is too small to retune on. Per-stage
   weight changes are capped (`params.retuneCapPerStage`); real retuning uses backtests on past Majors.
   Parameter changes go through a PR. A new input (a new kind of data or a new step in the model)
   may start with a new stage, under a new model version, when replaying the finished stages shows
   no harm and the previous version keeps running on the same matches, scored on the same results.
   A new model version only ever starts with a stage, never in the middle of one.
8. **Never invent data.** Missing data means wider uncertainty, not a guess.
