# Codex

Follow the shared roles in this folder and [ship.md](ship.md). Codex roles live in `.codex/agents/`; skills live in `.agents/skills/`.

## Models

| Who | Model | Reasoning effort |
|---|---|---|
| Lead | Sol (`gpt-6.1-sol`) | Low |
| Planner, including hard conflict resolution | Sol (`gpt-6.1-sol`) | High |
| Builder | Sol (`gpt-6.1-sol`) | Medium |
| Reviewer, QA reviewer, design reviewer, test engineer | Sol (`gpt-6.1-sol`) | Low |

The project config defaults new sessions to Sol with low effort. Each role TOML pins its model and reasoning effort. If the current chat overrides the project default, select Sol with low effort in the model picker; these files cannot switch a running lead.

## Launch and continue

Launch the configured custom agent matching the role name. Each prompt must stand alone: include the request, role file, plan path, workspace path and expected report.

For hosts exposing collaboration tools instead of custom role selection, use `collaboration.spawn_agent` with `fork_turns: "none"`, the explicit model above and the role's `reasoning_effort`: `"high"` for planning and hard conflict resolution, `"medium"` for building, and `"low"` for everything else. Include the role wrapper's instructions in the message. Use Sol for every role, including planning and conflict resolution.

Keep each agent id. Use `send_message` for a running agent and `followup_task` for an idle agent. Other hosts may expose `send_input` and `resume_agent`; use the available continuation tools. Continue the same builder and reviewer for fixes. Use notifications or the available wait tool instead of busy polling.

The lead coordinates every team step. Run at most three role agents concurrently, or fewer when the host has fewer slots; queue the rest. Teams advance as their active role reports back. Release finished slots when required, and resume saved agents for follow-up when supported.

## Worktrees

Include the workspace sentence from ship step 4 in every worktree role prompt. Run shell commands in that workspace and edit only inside it, except for reading the approved plan in the main checkout. Do not use automatic agent worktree isolation: `scripts/agents/ship.sh` owns worktrees.

All existing commands and their functions remain available through the shared script:

```sh
npm run ship -- start <slug> [branch]
npm run ship -- path <slug>
npm run ship -- status
npm run ship -- rebase <slug>
npm run ship -- land <slug>
npm run ship -- clean <slug>
```

`SHIP_BASE`, `SHIP_SKIP_INSTALL` and `SHIP_SKIP_CHECKS` retain their meanings. Preserve ship's plan approval, overlap map, relay, conflict escalation, one fix round, single commit, version bump, sequential landing and cleanup behavior. Hard data conflicts go to the Sol planner.

Only the lead performs git mutations. Root `AGENTS.md` requires user authorization for branches, commits and pushes. An explicit request for the full build-feature or ship workflow authorizes its documented local branch, commit and landing steps; a generic edit request does not. Push only when requested. Stage only the feature's files and preserve unrelated changes.

## Skills

| Claude Code command | Codex invocation |
|---|---|
| `/build-feature` | `$build-feature <request>` |
| `/ship` | `$ship <tasks>` |
| `/design-audit` | `$design-audit <scope>` |
| `/bug-sweep` | `$bug-sweep <scope>` |
| `/test-backfill` | `$test-backfill <scope>` |

Read `.agents/skills/<name>/SKILL.md` and use the user's request as its arguments. Higher-priority session requirements for progress updates and permissions take precedence over shared workflow defaults. Restart Codex if new roles or skills do not appear. No user-level settings or permissions are changed.

See the official [custom agent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents) and [skill discovery documentation](https://learn.chatgpt.com/docs/build-skills).
