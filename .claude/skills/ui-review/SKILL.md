---
name: ui-review
description: Check site pages after a UI change, or when asked to review, check or tidy the UI. Picks the cheapest check that fits the change - the measured audit (npm run ui-audit, free) always, the ui-reviewer agent (Sonnet, ~100k tokens) only for layout changes, new components or pages, or when the user asks.
---

# ui-review

Argument: routes to check (`stage/stage-1`, `market/stage-1`, `/`, ...) or nothing for the pages
the branch changed (`git diff origin/main...HEAD -- site engine`).

The builder misses small things in their own work, but a full review costs about 100k tokens. So the
free measured audit runs on every change, and the fresh-eyes reviewer only where a human-like look
pays off.

## 1. Pick the tier

| The change                                                               | Tier  |
| ------------------------------------------------------------------------ | ----- |
| Wording, a colour or token, one value or label, a bug fix inside a component, docs | light |
| Layout or spacing of a section, a new or reworked component, a new page, a new state (empty, loading, what-if) | full |
| The user asks for a review, or a release before a stage                  | full  |

When unsure, use light: the audit still runs, and CI runs it again on the PR.

## 2. Light (no agent)

1. `npm run ui-audit` and fix every failure until it reports 0 (the Stop hook also runs it when the
   turn ends, and stamps a pass).
2. Look at the changed blocks only: read the 1-2 `.ui-audit/<page>-<width>-<theme>-blockN.png`
   screenshots that show the change (desktop and mobile), not every page.
3. Say in one line what you checked.

## 3. Full

1. Light steps 1-2.
2. Start the site (`preview_start` name `site`; use the port it reports) and run the `ui-reviewer`
   agent once, with the URL, only the changed routes, a one-line summary of the change, and anything
   already decided with the user (so it does not re-report it).
3. Go through every finding: fix bugs, clear improvements and nits within the agreed design; for
   findings marked "(needs the user's choice)" give 2-3 options and ask (memory "UI options first");
   a skipped finding gets a one-line reason. Log open choices in `docs/roadmap.md`.
4. Re-check with the audit. Run the reviewer a second time only when the fixes changed layout, and
   then only on the affected routes, asking it to verify the listed fixes.
5. Report in a few lines: fixed, waiting for the user's choice, skipped and why.
