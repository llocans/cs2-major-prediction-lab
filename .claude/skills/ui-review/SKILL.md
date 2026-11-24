---
name: ui-review
description: Look at a page of the prediction site in the Browser pane (desktop and 375 px mobile) and list readability fixes against docs/core/design.md. Use when asked to review, check or tidy the UI, or after a UI change before opening the PR. Read-only; proposes options, changes nothing.
---

# ui-review

Argument: a route (`stage/stage-1`, `playoffs`, `pickem/stage-1`, `track-record`, `methodology`, `/`)
or nothing for the stage page of the current stage (`data/events/*/status.md`).

1. Read `docs/core/design.md` (the rules) and the page's component in `site/src/pages/`.
2. Start the site (`preview_start` with name `site`) and open `http://localhost:5173/#/<route>`.
   Select a team with a finished match (`?team=<id>`) so the team panel shows played rows.
3. Look at it as a first-time reader, in this order, with `screenshot` and `zoom`:
   desktop, then `resize_window` preset `mobile` (reset to `desktop` when done). Also check
   `read_console_messages` for errors.
4. Check each point and note only real problems, with where they are:
   - **Hierarchy:** one clear title; section headings smaller; the eye lands on the main number first.
   - **Spacing:** 4 px grid; related things close, separate sections clearly apart; no text touching
     borders; consistent gaps between the same kind of item.
   - **Text:** short labels; no sentence where a word does; no explanation the layout already makes
     obvious; team short names (`teamShortName`) in running text and tight spots, full names in the
     bracket and tables.
   - **Truncation:** no cut-off names or numbers (check with `javascript_tool`: elements whose
     `scrollWidth > clientWidth`).
   - **Colour:** accent only for predictions and the selected item; `win`/`loss` only for W/L and the
     model's pick marks; real results in ink. Both themes readable (`colorScheme` light and dark).
   - **Numbers:** tabular, right-aligned in tables, the same precision for the same quantity.
   - **Mobile:** no horizontal page scroll (the bracket may scroll inside its own box); tap targets
     not crowded.
5. Reply with at most 8 findings, most important first, each one line: where, what is wrong, the fix.
   For any change to layout or wording, give 2-3 options and ask before editing
   (see memory "UI options first"). Fixes go through a branch + PR like any code change.
