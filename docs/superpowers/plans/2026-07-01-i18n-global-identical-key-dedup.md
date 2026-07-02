# i18n Global Identical Key Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deduplicate all `src/lang/**` keys whose `zh` and `en` texts are exactly identical, migrate them to canonical `common.*` keys, update all call sites, and remove the replaced module keys.

**Architecture:** Treat `common.json` as the canonical sink. Reuse any existing `common.*` key first; otherwise add narrowly named shared buckets such as `common.skills`, `common.cli`, `common.gateway`, and `common.value`. Perform the migration with deterministic scripts plus targeted source edits, then verify that the language checker reports no missing or unused keys and that the targeted duplicate groups now resolve to `common.*`.

**Tech Stack:** TypeScript, Vue 3, Vue I18n JSON locale files, Node.js validation scripts

---

## File Map

**Create**

- `docs/superpowers/specs/2026-07-01-i18n-global-identical-key-dedup-design.md`
- `docs/superpowers/plans/2026-07-01-i18n-global-identical-key-dedup.md`
- `scripts/i18n-global-dedup-test.mjs`

**Modify**

- `src/lang/*/common.json`
- `src/lang/*/{antigravity,claude-code,copilot-cli,hermes,opencode,openclaw,codex,podman,tray,update,aside,host,base,flutter,cron,licenses,mcp,mysql,util,tools}.json`
- `src/lang/index.ts`
- renderer call sites that still reference the replaced module keys

**Verify**

- `node src/lang/check.mjs`
- `node scripts/lang-check-namespace-test.mjs`
- `node scripts/copilot-cli-missing-keys-test.mjs`
- `node scripts/i18n-global-dedup-test.mjs`

## Task 1: Lock the dedup target behavior with a failing test

**Files:**

- Create: `scripts/i18n-global-dedup-test.mjs`

- [ ] **Step 1: Write the failing regression script**

Create a script that:

1. Reads `zh` and `en` locale JSON files.
2. Asserts that the target duplicate groups exist under `common.*`.
3. Asserts that old duplicate source keys no longer exist.

The first version must intentionally fail against the current codebase for at least:

- `antigravity.openSkillsDir` / `copilot-cli.openSkillsDir` / `hermes.openSkillsDir`
- `claude-code.cmd.help` / `copilot-cli.cmd.help` / `hermes.cmd.help` / `opencode.cmd.help` / `openclaw.cmd.help`

- [ ] **Step 2: Run the regression script to verify it fails**

Run:

```bash
node scripts/i18n-global-dedup-test.mjs
```

Expected:

- `AssertionError`
- failure mentions missing canonical `common.*` key or surviving old module key

## Task 2: Define canonical common buckets in locale JSON files

**Files:**

- Modify: `src/lang/*/common.json`
- Modify: `src/lang/index.ts`

- [ ] **Step 1: Add the new shared buckets to all locale `common.json` files**

Add the following shape everywhere:

```json
{
  "skills": {
    "openSkillsDir": "",
    "openSkillDir": "",
    "revealSkillFile": "",
    "noSkills": "",
    "skillFileMissing": "",
    "skillLoadFailed": "",
    "builtin": ""
  },
  "cli": {
    "help": "",
    "version": "",
    "start": "",
    "mcpList": "",
    "doctor": "",
    "doctorFix": "",
    "gatewayStart": "",
    "gatewayStop": "",
    "gatewayRestart": "",
    "gatewayStatus": "",
    "gatewayRun": "",
    "gatewayUninstall": "",
    "skillsList": ""
  },
  "gateway": {
    "category": "",
    "status": "",
    "running": "",
    "stopped": "",
    "startFailed": ""
  },
  "value": {
    "yes": "",
    "no": "",
    "other": "",
    "default": "",
    "none": "",
    "local": ""
  }
}
```

- [ ] **Step 2: Extend the `LangKey` union**

Update `src/lang/index.ts` so the generated `LangKey` type includes the new `common.skills.*`, `common.cli.*`, `common.gateway.*`, and `common.value.*` paths through the existing `AppendStringToKeys<typeof common, 'common'>` surface.

- [ ] **Step 3: Run a focused structure check**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- no JSON structure mismatch caused by `common.json` shape divergence

## Task 3: Populate canonical common values and remove duplicated locale keys

**Files:**

- Modify: `src/lang/*/*.json`

- [ ] **Step 1: Write a deterministic one-off migration script and run it**

The script must:

1. Build duplicate groups from exact `zh` + `en` matches.
2. For each group:
   - reuse an existing `common.*` key if present
   - otherwise map to a planned `common.*` destination
3. Copy representative locale values into `common.*`.
4. Remove the replaced module keys from every locale file.

Required built-in mappings:

```js
const explicitMappings = {
  'antigravity.openSkillsDir': 'common.skills.openSkillsDir',
  'copilot-cli.openSkillsDir': 'common.skills.openSkillsDir',
  'hermes.openSkillsDir': 'common.skills.openSkillsDir',

  'antigravity.openSkillDir': 'common.skills.openSkillDir',
  'copilot-cli.openSkillDir': 'common.skills.openSkillDir',

  'antigravity.revealSkillFile': 'common.skills.revealSkillFile',
  'copilot-cli.revealSkillFile': 'common.skills.revealSkillFile',

  'antigravity.noSkills': 'common.skills.noSkills',
  'copilot-cli.noSkills': 'common.skills.noSkills',

  'antigravity.skillFileMissing': 'common.skills.skillFileMissing',
  'copilot-cli.skillFileMissing': 'common.skills.skillFileMissing',

  'antigravity.skillLoadFailed': 'common.skills.skillLoadFailed',
  'copilot-cli.skillLoadFailed': 'common.skills.skillLoadFailed',

  'antigravity.builtin': 'common.skills.builtin',
  'hermes.builtin': 'common.skills.builtin',

  'claude-code.cmd.help': 'common.cli.help',
  'copilot-cli.cmd.help': 'common.cli.help',
  'hermes.cmd.help': 'common.cli.help',
  'opencode.cmd.help': 'common.cli.help',
  'openclaw.cmd.help': 'common.cli.help',

  'claude-code.cmd.version': 'common.cli.version',
  'copilot-cli.cmd.version': 'common.cli.version',
  'hermes.cmd.version': 'common.cli.version',
  'opencode.cmd.version': 'common.cli.version',
  'openclaw.cmd.version': 'common.cli.version',

  'claude-code.cmd.start': 'common.cli.start',
  'copilot-cli.cmd.start': 'common.cli.start',

  'claude-code.cmd.mcpList': 'common.cli.mcpList',
  'copilot-cli.cmd.mcpList': 'common.cli.mcpList',
  'hermes.cmd.mcpList': 'common.cli.mcpList',

  'hermes.cmd.doctor': 'common.cli.doctor',
  'openclaw.cmd.doctor': 'common.cli.doctor',

  'hermes.cmd.doctorFix': 'common.cli.doctorFix',
  'openclaw.cmd.doctorFix': 'common.cli.doctorFix',

  'hermes.cmd.gatewayStart': 'common.cli.gatewayStart',
  'openclaw.cmd.gatewayStart': 'common.cli.gatewayStart',
  'hermes.cmd.gatewayStop': 'common.cli.gatewayStop',
  'openclaw.cmd.gatewayStop': 'common.cli.gatewayStop',
  'hermes.cmd.gatewayRestart': 'common.cli.gatewayRestart',
  'openclaw.cmd.gatewayRestart': 'common.cli.gatewayRestart',
  'hermes.cmd.gatewayStatus': 'common.cli.gatewayStatus',
  'openclaw.cmd.gatewayStatus': 'common.cli.gatewayStatus',
  'hermes.cmd.gatewayRun': 'common.cli.gatewayRun',
  'openclaw.cmd.gatewayRun': 'common.cli.gatewayRun',
  'hermes.cmd.gatewayUninstall': 'common.cli.gatewayUninstall',
  'openclaw.cmd.gatewayUninstall': 'common.cli.gatewayUninstall',
  'copilot-cli.cmd.skillList': 'common.cli.skillsList',
  'openclaw.cmd.skillsList': 'common.cli.skillsList',

  'hermes.category.gateway': 'common.gateway.category',
  'openclaw.category.gateway': 'common.gateway.category',
  'hermes.gatewayStatus': 'common.gateway.status',
  'openclaw.gatewayStatus': 'common.gateway.status',
  'hermes.gatewayRunning': 'common.gateway.running',
  'openclaw.gatewayRunning': 'common.gateway.running',
  'hermes.gatewayStopped': 'common.gateway.stopped',
  'openclaw.gatewayStopped': 'common.gateway.stopped',
  'hermes.startGatewayFail': 'common.gateway.startFailed',
  'openclaw.startGatewayFail': 'common.gateway.startFailed',

  'podman.common.yes': 'common.value.yes',
  'podman.yes': 'common.value.yes',
  'update.yes': 'common.value.yes',
  'podman.common.no': 'common.value.no',
  'podman.no': 'common.value.no',
  'update.no': 'common.value.no',
  'aside.other': 'common.value.other',
  'openclaw.category.other': 'common.value.other',
  'base.default': 'common.value.default',
  'util.macPortsSrcDefault': 'common.value.default',
  'base.none': 'common.value.none',
  'tools.ImageCompress.textureConfig.none': 'common.value.none',
  'hermes.local': 'common.value.local',
  'versionmanager.Local': 'common.value.local',

  'common.label.status': 'common.label.status',
  'podman.Status': 'common.label.status',
  'podman.container.status': 'common.label.status',
  'common.state.running': 'common.state.running',
  'podman.container.running': 'common.state.running',
  'tray.run': 'common.state.running',
  'common.action.uninstall': 'common.action.uninstall',
  'base.uninstall': 'common.action.uninstall',
  'common.action.disable': 'common.action.disable',
  'n8n.usersDisable': 'common.action.disable',
  'common.state.enabled': 'common.state.enabled',
  'cron.enabled': 'common.state.enabled',
  'common.state.disabled': 'common.state.disabled',
  'n8n.usersDisabled': 'common.state.disabled',
  'common.mcp.scope': 'common.mcp.scope',
  'cron.scope': 'common.mcp.scope',
  'common.label.name': 'common.label.name',
  'common.mcp.name': 'common.label.name'
}
```

- [ ] **Step 2: Verify removed source keys are actually gone**

Run searches like:

```bash
rg -n '"openSkillsDir"|"cmd": \\{|\"help\": \"Display help information\"' src/lang/*/{antigravity,copilot-cli,hermes,claude-code,opencode,openclaw}.json
```

Expected:

- only module-specific surviving keys remain
- migrated duplicate keys no longer exist in old files

## Task 4: Rewrite renderer call sites to `common.*`

**Files:**

- Modify: renderer components and command json files that still reference removed module keys

- [ ] **Step 1: Replace skills UI references**

Switch these kinds of usages:

```ts
I18nT('copilotCli.openSkillsDir')
I18nT('antigravity.openSkillDir')
I18nT('copilotCli.skillLoadFailed')
```

to:

```ts
I18nT('common.skills.openSkillsDir')
I18nT('common.skills.openSkillDir')
I18nT('common.skills.skillLoadFailed')
```

- [ ] **Step 2: Replace CLI command description references**

Switch these kinds of command JSON references:

```json
"descriptionKey": "claudeCode.cmd.help"
"descriptionKey": "copilotCli.cmd.version"
"descriptionKey": "hermes.cmd.mcpList"
```

to:

```json
"descriptionKey": "common.cli.help"
"descriptionKey": "common.cli.version"
"descriptionKey": "common.cli.mcpList"
```

- [ ] **Step 3: Replace gateway and value references**

Update any surviving UI references for gateway strings and literal values to their new `common.*` keys.

- [ ] **Step 4: Prove no stale call sites remain for the migrated groups**

Run:

```bash
rg -n "I18nT\\('(antigravity|copilotCli|hermes|claudeCode|openCode|openclaw)\\.(openSkillsDir|openSkillDir|revealSkillFile|noSkills|skillFileMissing|skillLoadFailed|builtin)'" src/render
rg -n "descriptionKey\": \"(claudeCode|copilotCli|hermes|openCode|openclaw)\\.cmd\\.(help|version|start|mcpList|doctor|doctorFix|gatewayStart|gatewayStop|gatewayRestart|gatewayStatus|gatewayRun|gatewayUninstall|skillList|skillsList)\"" src/render
```

Expected:

- no matches

## Task 5: Re-run the regression suite and checker

**Files:**

- Verify only

- [ ] **Step 1: Re-run the dedup regression**

Run:

```bash
node scripts/i18n-global-dedup-test.mjs
```

Expected:

- PASS

- [ ] **Step 2: Re-run existing namespace and Copilot regressions**

Run:

```bash
node scripts/lang-check-namespace-test.mjs
node scripts/copilot-cli-missing-keys-test.mjs
```

Expected:

- both PASS

- [ ] **Step 3: Re-run the language checker**

Run:

```bash
node src/lang/check.mjs
```

Expected:

- no missing-key failures
- no unused-key failures
- duplicate candidate list is reduced and no longer includes the migrated groups

- [ ] **Step 4: Run patch hygiene verification**

Run:

```bash
git diff --check
```

Expected:

- no whitespace or conflict-marker issues
