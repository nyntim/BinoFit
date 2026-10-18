---
name: bug-sweep
description: Audit existing BinoFit code for bugs and tech debt and return a ranked list. No code changes. Use when the user asks for a bug sweep, code audit, tech-debt review, or "what's broken".
---

Read `docs/agents/codex.md` for model selection, role launches, continuations, workspace isolation and authorization. Use the configured roles; do not inherit the lead model for the planner. Higher-priority session instructions take precedence over shared workflow defaults.



Spawn `qa-reviewer` in **audit mode**. Scope: the user's request and any supplied scope. If no scope was given, start with `lib/`, `hooks/` and `context/`, where most of the logic lives.

Present the findings to the user in two sections:
1. **Bugs**: confirmed bugs first, then suspicions, each ranked by severity.
2. **Tech debt**: ranked by payoff relative to effort.

Don't change any code. When you're done, ask the user which findings they want fixed.
