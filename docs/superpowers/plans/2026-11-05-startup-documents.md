# Missing Documents startup fix

User report: Electron cannot resolve `app.getPath('documents')`; SetupGlobalPaths throws before returning a Promise, aborting Application construction inside the async ready listener.

Success: missing optional Documents does not prevent normal data-directory initialization/window startup; valid redirected/UNC Documents stays authoritative. Do not invent `home/Documents`, create folders, migrate data, change registry, or write profiles at guessed locations. UserHome/data roots remain required and retain existing failure semantics.

Ownership: main ServerPath owns optional known-folder lookup. Windows shell profile discovery already accepts missing UserDocuments as no targets and reports its own failure on explicit shell initialization. Go Helper also validates/writes the resulting full profile paths, while UAC fallback uses UserDocuments as the allowed profile-write boundary; neither path is needed to launch the main window. When Documents is unavailable, profile setup fails before sending profile writes to Helper, without guessing a directory or weakening validation. No new renderer state, IPC or process lifecycle. No exceptions to module constraints.

Failure boundaries: optional Documents failure affects profile discovery only; actual home/data directory failures still propagate. Launcher owns final startup rejection reporting and quit, so constructor/init/start errors cannot become an unhandled ready-listener rejection. Existing data and completed writes are preserved; no relaunch/replay.

- [x] Add failing VM-based tests executing actual ServerPath/Launcher code for missing/empty Documents, normal redirected paths, actual directory errors and constructor/init/start rejections.
- [x] Isolate optional Documents read; locally handle startup rejection with existing logger/dialog and quit.
- [x] Run targeted tests/lint and main bundle verification; independently review failure boundaries.

Verification: observed missing-Documents RED before implementation and GREEN after; `test:startup-documents` and scoped ESLint pass, main dependency graph builds in memory (46 outputs), whitespace diff check passes, independent review found no blockers. Audited Go Helper module/tool.go, utils/whitelist.go, WindowsPrivilegeOperation.ts and WindowsHelperFallback.ts; no Go changes required. No registry/known-folder mutation, real user profile writes or release publishing performed.
