# Temporal UI Exit Cleanup Design

## Goal

Ensure that quitting FlyEnv sends the existing service shutdown signal to the detached Temporal UI (`ui-server`) process as well as the Temporal Server process.

## Design

`serviceStartSpawn` already returns `APP-Service-Start-PID`, and `IPCHandler` records that value in `ServiceProcessManager`. `Temporal.startUiServer` will preserve that return value instead of discarding it.

The response will also provide an `APP-Service-Start-Item` whose `bin` is the UI executable. `IPCHandler` will prefer this optional item when registering a PID. Consequently, the UI and Temporal Server have independent records: their `bin` values differ, so the existing bin-based deduplication cannot overwrite the server PID.

On application exit, the existing `ServiceProcessManager.stop()` logic will include both records in its `SIGINT` shutdown set. No Temporal-specific exit branch is required.

## Error Handling and Compatibility

The optional start-item field falls back to the original command argument for every existing service. Existing manual Temporal stop behavior remains unchanged. A PID file left after application shutdown is already removed before the next UI start, so no new file-cleanup path is required.

## Verification

Extend `scripts/temporal-module-test.ts` to assert that Temporal forwards the UI PID together with a distinct UI start item, and that `IPCHandler` supports the optional override. Run `yarn test:temporal`, formatting validation, and TypeScript type checking.
