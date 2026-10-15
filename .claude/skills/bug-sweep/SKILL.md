---
name: bug-sweep
description: Audit existing BinoFit code for bugs and tech debt and return a ranked list. No code changes. Use when the user asks for a bug sweep, code audit, tech-debt review, or "what's broken".
---

Spawn `qa-reviewer` in **audit mode**. Scope: $ARGUMENTS. If no scope was given, start with `lib/`, `hooks/` and `context/`, where most of the logic lives.

Present the findings to the user in two sections:
1. **Bugs**: confirmed bugs first, then suspicions, each ranked by severity.
2. **Tech debt**: ranked by payoff relative to effort.

Don't change any code. When you're done, ask the user which findings they want fixed.
