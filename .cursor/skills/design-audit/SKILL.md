---
name: design-audit
description: Audit existing BinoFit screens against DESIGN.md and PRODUCT.md and return a ranked fix list. No code changes. Use when the user asks for a design audit, UI review of existing screens, or design consistency check. In Cursor, spawn design-reviewer on Composer.
---

You are in Cursor. Ignore `.claude/skills/design-audit`. Follow `docs/agents/cursor.md`.

Spawn `design-reviewer` with `model: composer-2.5-fast` in **audit mode**. Scope: the user's request. If no scope was given, cover all of `app/` and `components/`.

Present the findings to the user grouped by screen, most important first. Don't change any code. When you're done, ask the user which findings they want fixed. Fixes go through the Cursor `build-feature` skill or a direct edit, whichever the user prefers.
