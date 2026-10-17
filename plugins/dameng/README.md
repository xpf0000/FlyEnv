# Dameng DM8 plugin

Experimental `dameng@0.1.9` for **native Windows x64** and **Ubuntu 22.04 x86_64**. Windows ARM64, other Linux releases/architectures and macOS are rejected. Source, plugin contract and simulated lifecycle checks are available; neither platform has completed real DM8 installation/start/stop acceptance yet. Do not describe this build as production-validated.

## Use

1. Build/install the plugin, then open **Dameng DM8 → Version Manager** and click Install. The FlyEnv installation dialog explains the path rules (English letters, digits and underscores in every folder name). Enter the final empty directory or click the button beside the input to open the native directory picker, then confirm to download. The plugin validates its path, ownership, space and writeability before downloading the pinned official package. Cancelling does not download or install anything. After installation, that exact directory is automatically added to the existing **Custom version directories** list.
2. In **Services**, start the owned version. FlyEnv reads the initialization state and opens the initialization dialog when needed; successful initialization continues the standard start, while cancel does not start the database. The **Initialize database** menu is also available. The dialog stays at 75vh with a scrolling body. Set the initial SYSDBA administrator and SYSAUDITOR audit-account passwords (each has a Generate button), port, page/extent size, charset, case sensitivity and resource profile. Both passwords are required; invalid fields are named individually. `123456_Xpf` meets the current plugin validation rules.
3. Start/stop/restart through the existing service controls. After restarting FlyEnv, startup asks for the current SYSDBA password if this session has none; Settings also lets you enter it before querying license information. Credentials are held in renderer session memory, never saved with settings.
4. Configuration and logs use the existing FlyEnv editors/toolbars. Instance information queries the real license expiry; it does not assume a fresh year from installation.
5. Uninstall through **Version Manager**. The official Windows uninstaller remains interactive; Linux uses the documented `uninstall.sh -i`. Database files are retained. Plugin disable/removal does not delete database programs or data.

Service and version pages use the existing host components and their default actions, including custom-version controls. The plugin uses ordinary internal IPC and requires no host source changes or extra capability checks.

The user explicitly authorized registration in the existing `AppStore.config.setup.dameng.dirs` list. Other module settings retain plugin-local storage. Installed lists and version-manager flags require both the registered custom directory and a complete owned engine at that recorded path. Removing the custom directory removes its installed flag, without deleting the engine. An existing owned installation missing registration offers registration-only retry; a failed registration save preserves the database/program and reports partial completion, without rerunning the installer. Returning to Version Manager refreshes these flags from the current custom-directory list.

## Layout and ownership

- Programs: the final directory selected by the user for this installation. Its canonical path is retained in the owned installation record and reused after worker/app restart. There is no automatic sibling directory or relocation.
- Data: `<BaseDir>/dameng/instances/<installId>/DAMENG`; CONTROL explicitly pins MAIN/SYSTEM/ROLL/control/redo files here, outside the program directory.
- Installation records: `<BaseDir>/dameng/installations/<installId>.json`.
- Cross-worker admission: `<BaseDir>/dameng/locks/`; one global install/uninstall lock plus per-install lifecycle locks.
- Linux startup output: `<BaseDir>/dameng/logs/`; vendor event logs remain in the official program log directory.
- Windows ownership proof: `<program>/.flyenv-windows-global.json`; exact global-config hashes, companion identities and service-registration intent.

Only owned records authorize management. Exact executable/configuration and process birth identity are checked; process name or installation directory alone does not authorize stopping a database. Linux uses the existing `serviceStartSpawn` with `stdin=ignore`, detached mode and `-noconsole`, and Base's SIGINT/exit-confirmation machinery with its candidate set restricted to the proven PID. It does not depend on a worker retaining stdin. Windows uses the vendor `dmsvc.exe database <instance>` service binding and normal SCM control; it never uses `taskkill /F` for database shutdown. SCM completion is followed by owned process-tree exit confirmation.

An interrupted/unknown operation retains its journal and admission lock. Required installation handoff errors also persist `requiresInspection`, surviving page/app restarts. The plugin deliberately blocks blind retry, overwrite, force-kill or uninstall while ownership/termination is unconfirmed. Inspect the recorded instance and OS processes before any manual recovery; removing a lock alone does not establish that an installer or database has stopped. A known pre-execution refusal remains retryable. If dminit completed and its verified success was recorded but service registration failed, initialization resumes registration without rerunning dminit or adopting newly entered initialization settings/passwords. Files alone do not prove successful initialization.

Passwords use a private temporary dminit CONTROL file, with POSIX `0700`/`0600` permissions or an explicitly restricted NTFS directory before writing. The file is removed at terminal cleanup; a crashed worker can leave a restricted temporary directory requiring inspection. DIsql receives current credentials through stdin, not argv, and disables DEFINE substitution before CONNECT so an ampersand in a generated password stays literal. Authentication refusal is reported separately from engine readiness and does not trigger alternate-password retries or database reinitialization. Command output/error diagnostics redact the submitted passwords; renderer requests use the existing ordinary internal IPC transport. Ordinary settings use `StorageGetAsync`/`StorageSetAsync` and `reactiveBind`, without Pinia or `config.setup`.

## Official media evidence

Catalog metadata was checked on 2026-10-16 against [the official download JSON](https://www.dameng.com/json/203/down-1096.json) and HTTP byte ranges. No ZIP/ISO/database files are included in the plugin.

- [Windows package](https://download.dameng.com/eco/adapter/DM8/202607/dm8_20260709_x86_win_64.zip): ZIP `517335198` bytes; `dm8_20260709_x86_win_64.iso`, `907055104` bytes; official ISO SHA256 `bd1465274838ef837abcb84b7e311c879723a7d678bc7360f85150b1b12065a0`.
- [Ubuntu 22 package](https://download.dameng.com/eco/adapter/DM8/202608/dm8_20260817_x86_Ubuntu22_64.zip): ZIP `860349960` bytes; `dm8_20260817_x86_Ubuntu22_64.iso`, `877658112` bytes; official ISO SHA256 `fb631279a60fa2fb814179fa712d4847aef32c9a2e694da5f93241d0fdef9d54`.

Digests were read from each archive's official `iso_SHA256.txt`, not independently computed from a full research download. At installation, the plugin verifies ZIP size/entry identity, streams only the pinned ISO entry and computes its complete SHA256 before mounting/execution. ZIP envelope hashes are not supplied by the catalog and are not invented. Changes to the pinned archive fail closed. Proven corrupt cached archives are discarded so an explicit retry can download fresh media; output/filesystem failures preserve the cache and no download is automatically replayed. Renderer-supplied download URLs are ignored in favor of this catalog. The user-selected final installation path is validated separately and then retained in the owned manifest.

Read-only inspection of the target packages' Java installer classes confirmed `INIT_DB=N` skips database-parameter parsing and supports the minimal XML. Windows service registration uses SCM plus `HKLM\SOFTWARE\Dameng\<service>` REG_SZ `path` and `model=open`; `tool/dmservice.exe` is a GUI, not a claimed registration CLI. This artifact evidence does not replace real-platform acceptance.

## Platform prerequisites and limitations

- The official installer XML rejects dots/hyphens in program paths, including ancestors (also confirmed in the pinned installer’s `AutoInstallXml` bytecode). The directory picker selects the final program directory; invalid, nonempty, protected/overlapping or nonwritable destinations fail validation before downloading. Existing empty directories created through the picker are supported. Native CONTROL data paths use platform path separators and single-quote INI escaping (doubling embedded apostrophes). Passwords use the same INI escaping to preserve `#` and `;`, separately from DIsql credential quoting; shell-style double quotes are not used for CONTROL paths. Separate data-path validation retains the original FlyEnv data directory, including `FlyEnv-Data`; program-path restrictions are not imposed on it. Length, writable-space and symlink checks remain required. A nonwritable destination reports an error without changing the whole FlyEnv root.
- Linux requires desktop `udisks2` (`udisksctl`), `findmnt` and sufficient writable program/cache/data space. The ISO is mounted read-only through udisks; authorization follows the desktop polkit session. Headless installation without these tools is not implemented.
- Linux runs the official installer as the current user and skips optional root/DmAP setup. Backup/restore and other helper-dependent capabilities are not promised.
- Windows service discovery uses official DM service names or an exact DM executable in the service command; generic `Dm` prefixes (including Windows device-management services) are excluded. Actual conflicts report their service names.
- Windows requires installation/registration UAC. The existing transaction configures caller permissions for the exact owned service/data/logs, sets owned companions to Manual and confirms them stopped. External DM config, services, registration or environment conflicts cause refusal.
- Default small profile: UTF-8, case-sensitive, 8 KiB pages, 16-page extents, BUFFER 256 MiB, three 128 MiB tablespaces and two 256 MiB redo logs. Shown initial storage estimate is 896 MiB plus other generated files. Immutable options cannot be reinitialized over existing data.
- Uninstall uses official behavior, preserves data, and reports completed removal separately from supplementary warnings. Exact unattended Windows uninstall switches and broad multi-version/external-DM coexistence remain unverified; only one owned installation is admitted.

## Verification and acceptance

Run existing commands without adding package.json scripts:

```sh
node --import tsx --test plugins/dameng/tests/*.test.ts
yarn test:renderer-operation-boundaries
yarn plugin:test dameng
yarn plugin:build dameng
```

Tests exercise real filesystem locks, ZIP deflate/hash verification and child commands; renderer/Fork transport edges are simulated. Available native PowerShell parses scripts, compiles the stop bridge and runs SCM/ACL-policy scenarios with OS calls mocked. No test grants actual Windows privileges or installs/stops a real database.

Before wider release, run the research document's target-platform PoC: install with real UAC/polkit, initialize, confirm exact-instance SQL readiness, commit data, stop normally, restart/read data, recycle the starting worker and stop again, verify app/plugin shutdown, ACL/log encoding, installer interruption/recovery, license expiry, external conflicts and official uninstall/data retention. Registry artifact URL stays empty until an artifact is explicitly published.
