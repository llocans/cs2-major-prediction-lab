---
name: ui-review
description: Check site pages after a UI change, or when asked to review, check or tidy the UI. Runs the measured UI audit (npm run ui-audit), then has the independent ui-reviewer agent look at the pages in the Browser pane (desktop + 375 px, light + dark), and goes through every finding. Required before opening a PR that changes site/ (the Stop hook reminds).
---

# ui-review

Argument: routes to check (`stage/stage-1`, `market/stage-1`, `/`, ...) or nothing for every page
the branch changed (`git diff origin/main...HEAD -- site engine`).

Small things get missed when the builder checks their own work, so this skill measures first and then
uses a reviewer that did not build the change. Nothing is waved through as "fine".

1. **Measure.** Run `npm run ui-audit` (builds the site; Chromium comes from `npx playwright install
   chromium` the first time). Fix every failure until it reports 0 failures: those are bugs
   (console errors, page scroll, cut-off text, content sticking out, text over text, contrast under
   WCAG AA). It also stamps the code state, which clears the Stop hook's reminder.
2. **Fresh eyes.** Start the site (`preview_start` name `site`; use the port it reports), then run
   the `ui-reviewer` agent with the URL, the routes and a one-line summary of what changed. Never
   review your own change yourself instead.
3. **Go through every finding.** Fix bugs, clear improvements and nits that stay within the agreed
   design. For findings marked "(needs the user's choice)" (layout or wording), give the user 2-3
   options and ask (memory "UI options first"). A finding you skip needs a one-line reason.
4. **Re-check.** After the fixes run `npm run ui-audit` again; for larger fixes run the reviewer
   again on the affected pages.
5. **Report** to the user in a few lines: what was fixed, what waits for their choice, what was
   skipped and why. Fixes go through the branch + PR like any code change.
