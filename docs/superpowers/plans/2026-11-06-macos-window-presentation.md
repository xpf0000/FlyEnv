# macOS Window Presentation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, then obtain one whole-change review. Track steps below.

**Goal:** After merging PR #957, show the main window in the Space and display where the user invokes it, without stale requests reopening it.
**Architecture:** WindowManager delegates presentation to a main-process WindowPresentation owner. That owner captures the cursor's display before asynchronous work, manages per-window cancellation and temporary Space visibility, and fits cross-display bounds to the target work area.
**Tech Stack:** Electron 39, TypeScript, esbuild-isolated native boundary tests plus a standalone Electron smoke fixture.
**Spec / authorization:** User requested merge first, fix both review findings, and implement target-display selection and migration. Existing conversation establishes the target as the display where tray/Dock invocation occurs. No additional product choice or approval is needed.

## Design and constraints

- PR #957 merged remotely as 1673e492; local master fast-forwarded. Original uncommitted files are SHA-256 recorded in tmp/pr957/original-files.json and must remain byte-identical.
- Use isolated branch fix/macos-target-display; integrate the verified fix into the original checkout without staging unrelated edits. No fix push unless requested.
- Main window on macOS: capture cursor point + display ID synchronously at presentation entry (tray show, Dock activate, second-instance, existing open and hidden toggle). Electron has no Dock-click display parameter; the cursor at invocation is the best available signal. Do not re-read the cursor after awaiting Dock/fullscreen transitions.
- Center on a different display, retain normal dimensions up to target workArea; clamp on the same display only when outside its workArea. Use DIP coordinates without multiplying scaleFactor; support negative origins and vertically stacked screens.
- If a captured display disappears, resolve the surviving display nearest the captured point. Re-read current display workArea at application time.
- Fit minimum dimensions to smaller work areas and restore the original minimum on a larger display. Restore minimized windows; preserve maximized mode. For native fullscreen migration, await leave-full-screen with cancellation and a bounded timeout, move, show, then re-enter fullscreen.
- The tray popup retains its existing icon-bounds positioning. It must not use main-window centering. No new settings or renderer/domain state.
- Existing all-Spaces windows remain unchanged. Temporarily changed windows restore after 300ms from the latest show, or immediately upon cancellation. Timers and fullscreen listeners belong to the window's lifecycle.
- Hidden, close, destroyed, quit, and a newer show invalidate older pending presentation. Hidden toggle cancels a pending show. Direct native close/hide also cancels, not just manager calls.
- Keep Windows/Linux presentation synchronous in effect and retain positioning; only macOS main windows migrate. Cold startup keeps restored placement.

## Operation and failure contract

Owner: WindowPresentation in main, lifetime: BrowserWindow; no renderer operation is added. Intermediate events: optional Dock show and leave-full-screen; terminal events: shown, superseded, hidden/closed/quit, transition failure. Latest invocation wins. No services or child processes are involved; no persistence, Pinia or shared domain types are added, so module exceptions are unnecessary.

Required dependencies: target geometry, leaving native fullscreen before changing bounds, and window show. Their errors stop that presentation and are logged by the owner, never left as unhandled promises. Dock visibility is supplementary: log its own rejection and continue presenting. Cleanup must not replay presentation. Completed movement remains a completed side effect even if a later native call fails.

## Review Focus

- Rapid repeated show and show/hide/quit during awaited work must respect the latest intent.
- Cursor movement, target removal or workArea changes during awaited work must not redirect to a newly hovered display.
- Already all-Spaces windows and tray popup positioning must remain unchanged.
- Small, negative-origin and mixed-scale displays must leave the title bar accessible.
- Minimized, maximized and native-fullscreen windows need intentional transitions and listener cleanup.

## Task 1: Reproduce presentation regressions and add the owner

Files: create src/main/ui/WindowPresentation.ts and scripts/window-presentation-test.ts; modify src/main/ui/WindowManager.ts.

- [x] Bundle the real WindowManager with native Electron boundary doubles and controlled timers; assert the timer remains active 300ms after the latest show, and pending Dock show cannot reopen after hide/close/quit or an older request wins.
- [x] Observe failures against merged PR #957; record output under tmp/pr957.
- [x] Implement presentation owner and route existing-open, show, toggle, hide and quit through it; retain non-mac behavior and permanently all-Spaces windows.
- [x] Run the regression script and confirm the lifecycle cases pass.

## Task 2: Add display migration and verify native integration

Files: extend owner and regression script; create test/fixtures/window-presentation-smoke.ts.

- [x] Add failing tests for A-to-B migration, same-display stability, captured target after cursor movement, target unplug/workArea change, negative coordinates, small displays, minimum-size restoration, minimized/maximized/fullscreen transitions and fullscreen timeout/cancellation.
- [x] Implement target snapshot + placement policy, preserving window modes and cancelling obsolete transitions.
- [x] Verify with `node_modules/.bin/tsx scripts/window-presentation-test.ts`, targeted ESLint/type checks and a bundled main-process compilation.
- [x] Run a separate Electron process using temporary userData and hidden fixture windows; check available real displays, repeated visibility, native mode transitions and no late reopening. Do not change the user's live FlyEnv process or services. If only one physical display is available, report that dual-display/Space visual acceptance still needs hardware testing.
- [x] Obtain one independent review, address substantive findings with regression coverage, integrate into original master, and verify original file hashes unchanged.

## Progress

- Tasks 1 and 2 complete inline. 36/36 regression checks and 11/11 native Electron checks pass.
- Review Important fixed: track native fullscreen entry/exit separately from presentation intent; cancellation resolves the waiter while later invocations still join the native transition. Native settling re-hides cancelled windows. Four review regressions observed RED then GREEN.
- Review destruction finding upgraded to lifecycle correctness and fixed: dispose presentation before destroyWindow removes listeners; no pending timer or rejection on expected destruction.
- Native evidence found AppKit emits hide while isVisible() remains true during fullscreen animation; cancel only on actual hidden visibility/app state. Additional characterization observed RED then GREEN, then actual AppKit smoke passed.
- Native fullscreen smoke uses real windows/animations with controlled source-display identity on one physical display. It verifies transitions, not dual-monitor geometry or Space visual correctness.
- Targeted strict TypeScript and ESLint pass; full main-process esbuild compilation passes. Full vue-tsc exhausted default 2GB heap. The repository build-config loader through tsx separately fails on existing node-machine-id CJS interop; packaging was not claimed or performed.
- No new module/domain/renderer state or service operations; no rule exceptions. No deferred review findings. Original user edits are verified by recorded hashes before and after integration.
- User authorized merge-first then fixes; implementation proceeded using the conversation's concrete scope, without another design-approval cycle. No additional shared-branch push is authorized by this plan.
