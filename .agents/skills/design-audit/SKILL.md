---
name: design-audit
description: Audit existing BinoFit screens against DESIGN.md and PRODUCT.md and return a ranked fix list. No code changes. Use when the user asks for a design audit, UI review of existing screens, or design consistency check.
---

Read `docs/agents/codex.md` for model selection, role launches, continuations, workspace isolation and authorization. Use the configured roles; do not inherit the lead model for the planner. Higher-priority session instructions take precedence over shared workflow defaults.



Spawn `design-reviewer` in **audit mode**. Scope: the user's request and any supplied scope. If no scope was given, cover all of `app/` and `components/`.

Present the findings to the user grouped by screen, most important first. Don't change any code. When you're done, ask the user which findings they want fixed. Fixes go through `$build-feature` or a direct edit, whichever the user prefers.
