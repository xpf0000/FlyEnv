# AI CLI Windows Proxy Injection Design

## Goal

Fix Windows proxy injection for the FlyEnv AI CLI installers that currently run inside a PowerShell PTY but still prepend Unix-style `export ...` commands.

This change covers:

- `ClaudeCode`
- `Kimi`
- `OpenCode`

This change does **not** alter OpenCode's current Windows installer command. It only fixes how proxy environment variables are injected before that command runs.

## Current Problem

The installer flows in:

- `src/render/components/ClaudeCode/setup.ts`
- `src/render/components/Kimi/setup.ts`
- `src/render/components/OpenCode/setup.ts`

all build proxy commands like:

```text
export HTTPS_PROXY="http://127.0.0.1:7890"
```

On Windows these installers execute inside the app's PowerShell-backed PTY, so `export` is ignored and the proxy variables are not applied to the installer command.

## Constraints

- Keep existing installer commands unchanged except where already separately approved.
- Match the project's existing Windows PTY command conventions.
- Avoid duplicating per-module PowerShell vs Unix proxy handling again.
- Keep the implementation limited to the three AI CLI modules above.

## Options Considered

### Option 1: Patch each module inline

Replace `export` with `$env:` directly in each module's Windows branch.

Pros:

- Smallest code diff
- Fastest one-off fix

Cons:

- Repeats the same platform branching in multiple files
- Easy to regress when new AI CLI modules are added

### Option 2: Shared helper for proxy command generation

Add a small shared helper that converts a proxy map into shell command lines for:

- Windows PowerShell: `$env:KEY="value"`
- Unix shells: `export KEY="value"`

Pros:

- Single maintenance point
- Reusable by the three target modules immediately
- Makes platform behavior testable without invoking the full UI

Cons:

- Slightly larger diff than inline edits

## Chosen Design

Use **Option 2**.

Add a shared helper in `src/shared/` that:

1. Accepts a proxy env map.
2. Accepts a target platform (`windows`, `macos`, `linux`).
3. Returns command lines suitable for the shell used by FlyEnv's PTY on that platform.

The three installer methods will:

1. Resolve their runtime platform from `window.Server`.
2. Ask the helper for proxy command lines.
3. Append their existing installer command.
4. Execute the combined command list through `XTerm.send(..., false)`.

## Escaping Rules

The helper must escape values so they remain valid shell assignments:

- PowerShell values use double-quoted `$env:KEY="value"` syntax with embedded backticks, quotes, and dollar signs escaped appropriately.
- Unix values use `export KEY="value"` with double-quote shell escaping.

The scope is limited to command generation for proxy values already provided by FlyEnv.

## Files Expected To Change

- `src/shared/` new helper file
- `src/render/components/ClaudeCode/setup.ts`
- `src/render/components/Kimi/setup.ts`
- `src/render/components/OpenCode/setup.ts`
- one regression script under `scripts/`

## Test Plan

Use a script-level regression test that:

1. Verifies Windows output uses `$env:`.
2. Verifies Unix output uses `export`.
3. Verifies value escaping for representative proxy strings.

Then run targeted lint on the changed files.

## Out of Scope

- Reworking other modules that also build proxy commands
- Changing OpenCode's Windows installer source
- Broad installer refactors beyond proxy injection
