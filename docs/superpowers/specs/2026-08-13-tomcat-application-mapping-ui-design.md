# Tomcat Application Mapping UI Design

## Goal

Make a Tomcat site's application-mapping editor visually and behaviorally consistent with the ordinary Host reverse-proxy editor, while reducing manual Context setup by discovering deployable applications immediately after the user selects a Tomcat `appBase` directory.

## Scope

- Rework the **Application mappings** area in `Host/Tomcat/Edit.vue` into the reverse-proxy pattern: title-row add icon, empty state, and one compact mapping row per Context.
- Keep the two Context fields explicit: a Context `path` and a `docBase`. A `docBase` keeps its directory/file picker because a Tomcat application may be either an exploded directory or a WAR.
- After the user picks a Tomcat appBase (`item.root`), scan its direct children and add discovered application mappings without replacing manually entered mappings.
- Keep the existing save/reconcile/restart operation, rewrite behavior, SSL behavior, and persisted model. Natural appBase mappings are reconciled as Tomcat auto-deployments, not Context descriptors.

## Alternatives Considered

### A. Scan automatically after choosing appBase (selected)

The scan runs only after a deliberate directory selection. It eliminates the common setup step without repeatedly inspecting the filesystem while a user types a path. It also leaves a manually typed appBase unchanged until the user explicitly selects it.

### B. Add a separate scan button

This offers more explicit control but adds a required interaction to the normal create-site flow. It remains unnecessary because directory selection is already an intentional action.

### C. Recursively scan every child directory

This finds nested applications but cannot distinguish deployment units from source folders, dependencies, or static assets. Tomcat's appBase deployment convention is its direct children, so the scan remains one level deep.

## UI Design

The mapping section mirrors the ordinary Host reverse-proxy section:

- The section heading has a link-style `Plus` icon button on the right. It adds a blank mapping with path `/` and an empty `docBase`.
- With no mappings, the content shows the existing localized `common.value.none` empty state.
- Each mapping is a single horizontal row: link-style `Delete` icon, Context-path input, and `docBase` input followed by its folder picker icon.
- Context field validation remains associated with its input. The compact layout must preserve a stable input area and must not hide the picker at narrow drawer widths.

The section continues to use `tomcat.contexts`. It does not adopt reverse-proxy data or change the meaning of `item.root`: root is the Tomcat Host appBase, whereas `docBase` is the application deployment source.

## AppBase Discovery

After `dialog.showOpenDialog()` successfully returns an appBase directory:

1. Assign the selected path to `item.root`.
2. Read direct directory names through the existing renderer `fs.subdir(path)` IPC. Read files through the existing recursive `fs.readdir(path, false)` IPC, retaining only returned names without a path separator; this is the direct-file level.
3. Accept every returned direct directory and every retained direct file whose name ends with `.war`, case-insensitively.
4. Map `ROOT` directory and `ROOT.war` to Context `/`; map every other accepted child to `/<name>`, with only the final `.war` suffix removed. Candidates whose generated path fails the existing Context-path safety validation are skipped. The mapping's `docBase` is the full child path.
5. Sort candidate paths deterministically before merging. Preserve each current mapping exactly and append only candidates whose Context path is not already present. A duplicate directory/WAR pair for the same Context produces one candidate, preferring the exploded directory.
6. File-read/stat errors, an inaccessible appBase, or an empty directory leave the selected root intact and make no mapping changes. Discovery is assistive and must never block save or replace field-level error feedback.

When a scanned mapping is a direct appBase child whose Context path equals its natural Tomcat deployment path, it is persisted but receives no FlyEnv Context descriptor. Tomcat deploys it through the Host's normal auto-deploy behavior. External applications and custom Context paths retain the standard descriptor workflow.

No recursive traversal occurs. Hidden files are ignored unless they are a directory or a WAR and match the normal direct-child rules; this keeps behavior grounded in filesystem type rather than platform-specific naming conventions.

## Ownership And Error Handling

The mounted drawer owns `item.root`, its transient mapping list, scan requests, and input errors. The scan makes no host-save IPC request and has no state that must survive a closed drawer.

`TomcatSiteController` continues to own the long-running operation: fork mutation, notices, re-entry protection, restart decision, and terminal cleanup. A scan is not a service lifecycle operation, does not change runtime process state, and must not be added to Pinia or shared setup configuration.

## Verification

- Extend `scripts/tomcat-site-drawer-test.ts` to require the reverse-proxy-style title action, compact row controls, empty state, and icon-based deletion.
- Add pure helper coverage for candidate creation and merge behavior: directories, case-insensitive WAR files, ROOT handling, duplicate candidate paths, and preservation of existing Contexts.
- Add source-level coverage that appBase selection invokes the existing `fs.subdir` and `fs.readdir` IPC APIs and applies discovery only after a successful selection.
- Run the focused Tomcat drawer, renderer setup, controller, save, server XML, and operation-boundary regression scripts, followed by `vue-tsc` to isolate introduced type errors.
