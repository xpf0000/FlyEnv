# Temporal UI and Startup Design

## Goal

Fix Temporal Server startup on Windows, make the Configuration tab use the full-height Codex layout, and replace the managed Web UI controls with a Mailpit-style website icon that installs and starts the UI on demand.

## Scope

### Configuration tab

`src/render/components/Temporal/Config.vue` will use the same structural pattern as Codex:

- An outer `module-config` flex column that fills the tab height.
- A flexing Element Plus card whose header contains the Server/UI file selector.
- `Conf/conf.vue` in the card body, with the existing `Conf/tool.vue` toolbar in the footer.

The Server choice edits `temporal-v<version>.yaml`; the UI choice edits `temporal-ui.yaml`. Selecting a missing file retains the current lazy initialization behavior.

### Windows startup fix

Temporal Server is currently launched with `-r /`. On Windows, that deprecated root option turns the absolute config directory into `\\E:\\...`, which the server cannot open. The server will instead receive only its absolute config directory and environment name:

```text
-c <BaseDir>/temporal/config -e temporal-v<version> start
```

The argument builder will be a small pure utility so the platform-safe command shape has a direct regression test. A local `temporal-server render-config` run with these arguments has already confirmed that the existing configuration is loaded successfully.

### Web UI lifecycle

The persisted `TemporalSetup.uiEnabled` preference, the service-start extension parameter, the Service-tab Web UI switch, version label, and Install button will be removed.

When a Temporal Server version is running, the Service card will display only a website button, matching Mailpit's placement and icon style. Clicking it performs this sequence:

1. Reset any prior error state and show the button's loading treatment.
2. Query whether the Temporal UI binary is installed.
3. If not installed, fetch the latest UI artifact and install it through the existing Fork download/install flow.
4. Start the UI through a public, idempotent Temporal Fork method. The method initializes its YAML as needed and reuses a live managed UI process rather than creating another listener.
5. Open the configured local UI URL in the system browser after the start call succeeds.

The button is green while idle and changes to Element Plus loading while installation or startup is active. A download, install, or startup failure ends in a persistent red icon; the next click retries the full operation. The button is hidden when the Temporal Server itself is not running.

Stopping Temporal Server continues to stop the managed UI process.

## Boundaries

- The main Temporal Server never auto-starts the Web UI.
- The Web UI's existing configuration file and default port (`8233`) remain supported.
- No version-manager behavior, download source, or Temporal CLI behavior changes.
- Existing log files remain the source of detailed failure information; the UI state supplies the immediate visual error feedback.

## Verification

1. Extend `scripts/temporal-module-test.ts` with a regression assertion for the server launch arguments: no `-r` argument and correct absolute config directory/environment values.
2. Run `yarn test:temporal`.
3. Run the focused TypeScript/Vue validation available in the project, then build the relevant renderer and Fork bundles where practical.
4. Manually verify on Windows that `temporal-server render-config` with the generated arguments loads the versioned configuration, then start Temporal and click the website icon through its install/start/open path.
