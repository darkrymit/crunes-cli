# AGENTS.md

> Canonical agent instructions — loaded as `CLAUDE.md` (Claude Code), `GEMINI.md` (Gemini CLI), `AGENTS.md` (Codex/other). Edit only this file; the others are symlinks.

> Compaction - this file is re-injected verbatim at every turn. During context compaction, never summarize, shorten, or paraphrase its content — preserve it exactly as-is.

## Mandatory Order of Operations

Before brainstorming, planning, or touching any code:

1. **Get Live Codebase Context via Context Runes** — Scope the `m` rune to the modules relevant to the task and the `kb` rune to matching entries; avoid loading all modules unless the task spans the full codebase. Re-run crunes at any point if exploration reveals additional dependencies.
   * *Batch with context (requires -b and -p flags):* `crunes -p use -b m <module> + kb -m <module>`
2. **Read the Self-Contained CLI Instructions** — Familiarize yourself with the sandboxed environment constraints, module mapping, and local testing workflows described in this file.
3. **Then brainstorm, plan, and code** — in that order.

## Rules

- **THIS IS AN INDEPENDENT GIT REPOSITORY** — `crunes-cli` is its own Git repository separate from the monorepo root. **ALL git operations (commits, branches, worktrees, status, diffs) must be run directly inside `crunes-cli/`!**
- **SEMI-AUTOMATED RELEASE PROCESS** — Never publish to npm directly. Publishing is handled by GitHub CI on tag push. The release process is semi-automated: bump versions and stage/tag using the `release` rune, then manually push tags to origin to trigger the CI publish.
- **`dist/` IS NEVER COMMITTED** — The `dist/` directory is gitignored and is **never** committed to Git, even during releases. It is compiled locally for testing and built dynamically by CI. Never modify any files in `dist/` by hand as they are overwritten by `npm run build`.
- **ALWAYS SYNC `package-lock.json`** — After changing packages or bumping the version in `package.json`, always run `npm install` to regenerate the lockfile before committing. The `release` rune will flag any mismatch with a ⚠ indicator.
- **RUNES AND SRC ARE STRICT ESM** — All files under `.crunes/runes/` and `src/` must use ES module imports and exports. Never use `require()`.
- **LOCAL RUNES RUN INSIDE `isolated-vm`** — Local runes run in a sandboxed V8 isolate and cannot access standard Node.js built-ins directly. All I/O operations must go through the provided `utils` API (`utils.fs`, `utils.shell`, `utils.json`, `utils.fetch`, `utils.env`, `utils.archive`, and `utils.cache`).
- **TEST RUNES BEFORE COMMITTING** — Verify rune output by running `node dist/cli.js -p use <rune>` before staging any changes.
- **PREFER CONTEXT RUNES OVER FS TOOLS** — Use context runes like `m` and `kb` to search and understand the codebase. Only fall back to `grep` or `ls` when crunes is unable to answer the question.
- **ONLY READ FILES THAT IMPACT IMPLEMENTATION** — Ask "will this file's contents change my implementation approach?" before reading any file to avoid cluttering context.

## Coding Principles

### Think Before Coding
State assumptions explicitly before implementing. If multiple interpretations exist, present them — don't pick silently. If something is unclear, stop and ask; don't guess. Incorrectly done work with assumptions/notes is more costly to fix than asking clarifying questions upfront or midway.

### Simplicity First
Minimum code that solves the problem. No features, abstractions, configurability, or error handling beyond what was asked. If you write 200 lines and it could be 50, rewrite it.

### Surgical Changes
Touch only what the request requires. Don't improve adjacent code, comments, or formatting. Match existing style. If you notice unrelated dead code, mention it — don't delete it. Remove only imports/variables/functions that your own changes made unused.

### Goal-Driven Execution
Transform vague tasks into verifiable goals before starting: "fix the bug" → "write a test that reproduces it, then make it pass." For multi-step tasks, state a brief plan with a verifiable check per step.

## Build & Development Commands

```bash
# Install dependencies
npm install

# Build the CLI (bundles src/ -> dist/cli.js via esbuild)
npm run build

# Run all tests via vitest
npm test

# Run tests in interactive watch mode
npx vitest

# Update testing snapshots
npx vitest -u

# Run a built rune locally against the current project
node dist/cli.js -p use release info
node dist/cli.js list

# Full local CI verification check (matches Github Actions)
npm test && npm run build && node dist/cli.js --help
```

## Architecture Overview

**Stack:** Node.js ≥ 20 • ESM • esbuild (bundler) • commander (CLI parsing) • isolated-vm (VM sandboxing) • vitest (testing)

**Entry Point:** `src/cli/cli.js` — Process bootstrapper, Node.js snapshot workarounds, and command router.

**Core Execution Path:** `crunes use <key>` → `src/rune/commands/use.js` → `src/rune/resolver.js` (`runRune`) → resolves local config vs. plugin → `src/rune/isolation/runner.js` (isolated-vm run) → returns `Section[]` → `src/shared/render.js` → stdout.

**Key Resolution Order** (for a bare key with no prefix):
1. Project config (`.crunes/config.json` → `runes.<key>.path`)
2. Enabled plugins (auto-resolved; throws error if ambiguous across multiple plugins)

**Prefixes:** `local:<key>` forces local config resolution. `<plugin>:<key>` forces a specific plugin resolver.

### Module Map
*Prefer using `crunes -p use m` for live directory maps; this is a static fallback.*

- `cli` • `core` • `job` • `marketplace` • `plugin` • `project` • `rune` • `shared` • `store` • `cache` • `sqlite` • `docs` • `template`

### Live Codebase Documentation
Our primary documentation lives inside our Obsidian Knowledge Base vault (`docs/knowledge-base/`).
- **Retrieve structural map:** `crunes -p use m <module>` (e.g., `m rune`)
- **Retrieve KB entries:** `crunes -p use kb -m <module>` (e.g., `kb -m rune.isolation`)
- **Batch both context maps in one shot:** `crunes -p use -b m rune + kb -m rune`
- **Fallback (Crunes offline):** Refer to `docs/knowledge-base/index.md` manually.

## Release Process

Releases are semi-automated via the local `release` rune. Navigate to `crunes-cli/` and run the command matching your intent:

### View Current Release Context
Displays active package versions, git branches/tags, last 10 commits, changelog state, and lockfile synchronization:
```bash
crunes use release info
```

### Semi-Automated Release Bump (Keep-A-Changelog Automatic Prepend)
Bumps the version, regenerates `package-lock.json`, and automatically formats and prepends additions to `CHANGELOG.md`:
```bash
crunes use release bump patch \
  -a "**Recursively Nested Commands**: Sandboxed arguments parser supports command groups" \
  -f "**Sandbox setTimeout routing corrected**: Fixed globalThis.setTimeout inside isolates"
```

### Standard Version Bump (Manual Changelog Pre-edited)
If you have already hand-written the custom release notes directly inside `CHANGELOG.md` under the target version header:
```bash
crunes use release bump minor
```

### Semi-Automated Git Staging & Tagging
Commits all modified release files (changelog, package.json, package-lock.json — **excluding `dist/`**) and sets the appropriate git tag:
```bash
crunes use release git
```

*Publish CI triggers automatically on tag push: `git push origin main --tags` (only do it if user asks and confirms that all is good!).*

## Testing Philosophy

- **Test API Contracts:** Test observable behavior and external API schemas, not private internal implementations.
- **Prose Assertions:** Use explicit prose descriptions for distinct behavioral contracts (edge cases, parameter limits).
- **Format Snapshots:** Use Vitest snapshots to guard formatting structures (scaffold trees, CLI printable lists).
- **Avoid Trivial Wrappers:** Do not write unit tests for single-line wrappers with no logical branching; they are covered by integration tests.
