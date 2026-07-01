<!-- mirror-verbatim: CLAUDE.md == AGENTS.md -->
# Project Instructions

Project-level instructions for this repo. `CLAUDE.md` (Claude Code) and `AGENTS.md`
(Codex, Antigravity, Cursor, any AGENTS.md-compatible tool) are kept
**verbatim-identical**, enforced by `scripts/check_mirror_equality.py`. This file is
**additive to global doctrine** (`~/.claude/CLAUDE.md` + `~/.gemini/AGENTS.md`) — carry
only the project delta here; never restate global rules. Cross-tool convention:
`~/.claude/rules/memory-hierarchy.md`.

> **Two mirror modes — this starter is VERBATIM.** Verbatim (`CLAUDE.md` == `AGENTS.md`)
> fits a project whose doctrine lives entirely in this file. **The moment you add a
> project-local path-scoped rule under `.claude/rules/`, switch to GENERATED mode:**
>
> ```bash
> python3 scripts/build_agents_mirror.py --repo .
> ```
>
> That replaces the `mirror-verbatim` marker with the generated one and builds `AGENTS.md`
> = this file + inlined always-on rules + pointers to path-scoped rules, so Codex /
> Antigravity (which have no rules-dir auto-load) get the full doctrine. The pre-push
> check fails a verbatim repo that has `.claude/rules/`, so you can't forget.

## Project Context

<!-- What this repo is, its layout, non-obvious conventions. Replace this. -->

## (add sections as the project needs)
