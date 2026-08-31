# PHP Project Directory Move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve hidden files after PHP project creation on every desktop platform while retaining directory-level rename performance for non-conflicting project directories.

**Architecture:** The Project fork gains a module-local mover that renames immediate staging children into the selected document root and uses the existing recursive merger only for same-named destination directories. A module-local renderer controller owns Composer's XTerm-to-fork operation; macOS/Linux and Windows dialogs bind it rather than owning IPC or terminal completion. Legacy static Bash scripts use a portable direct-child shell loop because they cannot access Node's filesystem API.

**Tech Stack:** TypeScript, Vue 3 Composition API, Electron renderer IPC, Node `fs-extra` rename operations, Bash, `tsx` assertion scripts.

**Spec:** `docs/superpowers/specs/2026-08-30-php-project-directory-move-design.md`

## Global Constraints

- Preserve the existing selected document-root directory; never delete it to make a whole-directory rename possible.
- Create staging inside that directory as `flyenv-create-project`, so all native rename operations remain on the same filesystem.
- A successful operation moves every direct child, including names beginning with `.`; remove staging only after all moves finish.
- Only a missing destination entry uses native rename. Two real directories merge; every other same-name collision rejects with `EEXIST` without overwriting either entry.
- Fork-owned migration rejects on failure and retains remaining staging content for recovery.
- Renderer operation state lives in a module-local controller bound through `reactiveBind`; do not add Pinia state or `config.setup` persistence.
- All three active platform flows use the Fork mover. The remaining static macOS/Linux scripts remain Bash-compatible. The unused Windows-named `.cmd` artifact is deleted and is not a supported command path. Do not use `mv --`, BSD/GNU `find` extensions, or a platform-specific `rename` executable.

---

### Task 1: Add a Project-Local Direct-Child Mover and Its Regression Test

**Files:**
- Create: `src/fork/module/Project/ProjectDirMover.ts`
- Create: `scripts/php-project-directory-test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `moveProjectDirContents(stagingDir: string, destinationDir: string): Promise<void>`.
- Consumes: `readdir`, `rename`, `remove`, and the existing `moveDirToDir` helper exported by `src/fork/Fn.ts`.
- Later tasks call this function only from `Project.handleProjectDir`.

- [ ] **Step 1: Write the failing filesystem regression test**

Create `scripts/php-project-directory-test.ts`. Use `mkdtemp(join(tmpdir(), 'flyenv-php-project-'))` and create the following fixture:

```ts
const destination = join(workspace, 'project')
const staging = join(destination, 'flyenv-create-project')
await mkdir(join(staging, 'vendor', 'composer'), { recursive: true })
await writeFile(join(staging, '.env'), 'APP_ENV=local\n')
await writeFile(join(staging, '.gitignore'), '/vendor\n')
await writeFile(join(staging, 'vendor', 'composer', 'installed.json'), '{}\n')
await symlink('.env', join(staging, '.env-link'))

await moveProjectDirContents(staging, destination)

assert.equal(existsSync(join(destination, '.env')), true)
assert.equal(existsSync(join(destination, '.gitignore')), true)
assert.equal(existsSync(join(destination, '.env-link')), true)
assert.equal(existsSync(join(destination, 'vendor', 'composer', 'installed.json')), true)
assert.equal(existsSync(staging), true)
assert.deepEqual(await readdir(staging), [])
```

Add a second fixture where `destination/vendor/existing.txt` exists before the move and staging contains `vendor/new.txt`; assert both destination files exist and staging is empty. Add a file-collision fixture where both staging and destination contain `.env`; assert rejection with `code === 'EEXIST'`, destination `.env` retains its original contents, and staged `.env` still exists.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn tsx scripts/php-project-directory-test.ts`

Expected: module-not-found failure for `ProjectDirMover`.

- [ ] **Step 3: Implement the project-local mover**

Create `src/fork/module/Project/ProjectDirMover.ts`:

```ts
import type { Stats } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { moveDirToDir, readdir, remove, rename } from '../../Fn'

export async function moveProjectDirContents(stagingDir: string, destinationDir: string) {
  const entries = await readdir(stagingDir, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = join(stagingDir, entry.name)
    const destinationPath = join(destinationDir, entry.name)
    let destinationStat: Stats | undefined
    try {
      destinationStat = await lstat(destinationPath)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }

    if (!destinationStat) {
      await rename(sourcePath, destinationPath)
    } else if (entry.isDirectory() && destinationStat.isDirectory()) {
      await moveDirToDir(sourcePath, destinationPath)
      await remove(sourcePath)
    } else {
      const error = new Error(`Project entry already exists: ${destinationPath}`)
      Object.assign(error, { code: 'EEXIST' })
      throw error
    }
  }
}
```

Keep the helper inside the Project module because its merge policy is specific to project creation. Do not add it to `src/fork/util/Dir.ts`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `yarn tsx scripts/php-project-directory-test.ts`

Expected: all fixture assertions pass and the script prints `php project directory tests passed`.

- [ ] **Step 5: Register the focused test command**

Add this package script:

```json
"test:php-project-directory": "tsx scripts/php-project-directory-test.ts"
```

Run: `yarn test:php-project-directory`

Expected: `php project directory tests passed`.

### Task 2: Make the Project Fork Own the Final Migration

**Files:**
- Modify: `src/fork/module/Project/index.ts`
- Modify: `scripts/php-project-directory-test.ts`

**Interfaces:**
- Consumes: `moveProjectDirContents` from Task 1.
- Produces: unchanged fork IPC contract `handleProjectDir(dir: string, framework: string)`.
- Terminal result: resolves only after the migration, staging cleanup, and Laravel `.env` fallback are complete; rejects without removing remaining staging content.

- [ ] **Step 1: Add failing source-contract assertions**

Append assertions to `scripts/php-project-directory-test.ts`:

```ts
const projectSource = readFileSync('src/fork/module/Project/index.ts', 'utf8')
assert.match(projectSource, /import \{ moveProjectDirContents \} from '\.\/ProjectDirMover'/)
assert.match(projectSource, /await moveProjectDirContents\(pdir, dir\)/)
assert.doesNotMatch(projectSource, /await moveDirToDir\(pdir, dir\)/)
assert.match(projectSource, /await remove\(pdir\)/)
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `yarn test:php-project-directory`

Expected: source-contract assertion failure because `handleProjectDir` still directly calls `moveDirToDir`.

- [ ] **Step 3: Switch the fork to the direct-child mover**

In `src/fork/module/Project/index.ts`, replace the `moveDirToDir` import with `moveProjectDirContents` from `./ProjectDirMover`. Keep `pdir = join(dir, 'flyenv-create-project')`, the existing missing-staging rejection, `await remove(pdir)` after a successful mover call, and the Laravel `.env` fallback exactly as they are. Do not catch-and-ignore mover errors.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `yarn test:php-project-directory`

Expected: the fixture and Project fork source-contract assertions pass.

### Task 3: Move Composer-to-Fork Coordination into a Renderer Controller

**Files:**
- Create: `src/render/components/Host/CreateProject/PhpProjectCreateController.ts`
- Modify: `src/render/components/Host/CreateProject/phpCreate.vue`
- Modify: `src/render/components/Host/CreateProject/phpCreate.win.vue`
- Modify: `src/render/components/Host/CreateProject/project.ts`
- Modify: `scripts/php-project-directory-test.ts`
- Modify: `scripts/renderer-operation-boundaries-test.ts`

**Interfaces:**
- Produces: a singleton `PhpProjectCreateController` wrapped in `reactiveBind`.
- `start(request: PhpProjectCreateRequest, terminalDom: HTMLElement): Promise<void>` starts at most one Composer operation.
- `stop(): Promise<void>` marks cancellation before stopping XTerm.
- `attach(terminalDom: HTMLElement): Promise<void>` remounts the ongoing terminal after dialog re-entry.
- `detach(): void` unmounts the terminal when a dialog disappears without terminating the operation.
- `reset(): void` destroys a completed terminal and clears controller-owned result state only when no operation is running.
- State exposed to both dialogs: `running`, `created`, `failed`, and `error`. The terminal is controller-owned and stored with `markRaw`; it is not part of reactive dialog state.

- [ ] **Step 1: Add failing renderer source-contract assertions**

Append PHP mover source assertions to `scripts/php-project-directory-test.ts`: both dialogs must contain no `mv ./* ../`, and the Fork call must remain only in the controller. Add controller-boundary assertions to `scripts/renderer-operation-boundaries-test.ts`: both dialogs import `PhpProjectCreateController`, the controller imports `IPC`, `reactiveBind`, `markRaw`, `XTerm`, and `MessageError`; it sends `handleProjectDir` only after awaiting terminal completion; and `project.ts` no longer declares PHP operation state (`running`, `created`, `createFail`) or stores `execing.PHP`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```sh
yarn test:php-project-directory
yarn test:renderer-operation-boundaries
```

Expected: the PHP source assertion fails because macOS/Linux still contains `mv ./* ../`; the operation-boundary guard fails because no PHP controller exists and the Windows dialog owns the project IPC callback.

- [ ] **Step 3: Implement the controller operation contract**

Create `PhpProjectCreateController.ts` beside the dialogs. Define a request type containing the immutable `dir`, `php`, `composer`, `version`, `package`, `framework`, `isWordPress`, `proxy`, and `isWindows` values. Bind one singleton with `reactiveBind`. Store the `new XTerm()` instance using `markRaw`, so Vue never proxies xterm's DOM, event listeners, or `Terminal` object.

`start` must build the existing Composer commands from the request snapshot, create and mount one `XTerm`, and retain an `inFlight` promise. For non-WordPress projects, it must always pass `flyenv-create-project` as Composer's destination directory. After `await terminal.send(commands, false)`, it must return without fork work when `cancelled` is true. Otherwise it calls:

```ts
IPC.send('app-fork:project', 'handleProjectDir', request.dir, request.framework)
```

Resolve that IPC response only when `res.code === 0`; ignore `res.code === 200` as a non-terminal progress event. On success set `created = true`; on a terminal exception or fork error, retain `created = false`, set `failed = true`, set `error` from `res.msg` or the thrown error, show it with `MessageError`, and leave staging untouched. In every terminal branch clear `running` and `inFlight`. `stop` must set `cancelled = true` before calling `terminal.stop()`.

Modify `project.ts` so `ProjectPHPForm` contains only PHP form inputs (`dir`, `php`, `composer`, `version`, and `framework`), `phpFormInit` resets only those fields, and `execing` excludes `PHP`. Do not persist request data, use Pinia, or move filesystem operations into the renderer.

- [ ] **Step 4: Refactor both dialog components to bind the controller**

Replace each component's direct `XTerm` creation, `command` construction, terminal `send`, Project IPC, and stop logic with controller calls. Each dialog keeps only its form controls, folder picker, `xterm` DOM ref, and host-creation callback. It snapshots `ProjectSetup.form.PHP` and `app.value.package` into a controller request on confirm; it calls `controller.attach(xterm.value)` on mount when `controller.running` is true; and it calls `controller.detach()` during unmount. Its cancel and completed-host paths call `controller.reset()` before `ProjectSetup.phpFormInit()`.

Remove the macOS/Linux terminal commands that change into staging, invoke `mv`, change back, and remove staging. Standardize its Composer target from `flyenv-created-project` to `flyenv-create-project`. Keep the WordPress direct-to-document-root flow and its `composer.json` generation in the controller request branch. Remove the Windows-only `createFail` footer branch; both dialogs use the controller's `failed` state only for result display and allow a new attempt after completion.

- [ ] **Step 5: Run the focused test to verify it passes**

Run:

```sh
yarn test:php-project-directory
yarn test:renderer-operation-boundaries
```

Expected: fixture tests and source-contract assertions pass; the operation-boundary guard confirms the controller owns the PHP creation operation; neither PHP dialog contains `mv ./* ../`.

### Task 4: Replace the Legacy Static-Script Exact Command Safely

**Files:**
- Modify: `static/sh/macOS/project-new.sh`
- Modify: `static/sh/Linux/project-new.sh`
- Modify: `scripts/php-project-directory-test.ts`

**Interfaces:**
- Legacy script behavior remains: Composer creates a staging directory under `projectdir`, all direct entries move into `projectdir`, and staging is deleted only after all moves succeed.
- The macOS/Linux scripts retain Bash compatibility and do not require Node, GNU coreutils, BSD/GNU `find` extensions, or a platform-specific `rename` executable. Windows is verified through the active renderer-to-Fork path. The unused Windows-named `.cmd` artifact is deleted and is not validated as CMD or PowerShell.

- [ ] **Step 1: Add failing static-script assertions**

Read the two remaining scripts in `scripts/php-project-directory-test.ts`. Assert none contains `mv ./* ../`, `mv --`, or `-maxdepth`, and each contains the exact portable mover. Also assert that `static/sh/Windows/project-new.cmd` no longer exists.

```sh
for item in ./* ./.[!.]* ./..?*; do
  [ -e "$item" ] || [ -L "$item" ] || continue
  mv "$item" ../ || exit 1
done
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `yarn test:php-project-directory`

Expected: script-source assertions fail on both remaining legacy scripts.

- [ ] **Step 3: Update each script**

Replace only these four lines in each script:

```sh
cd flyenv-created-project || exit 1
mv ./* ../
cd ../
rm -rf flyenv-created-project
```

with:

```sh
cd flyenv-created-project || exit 1
for item in ./* ./.[!.]* ./..?*; do
  [ -e "$item" ] || [ -L "$item" ] || continue
  mv "$item" ../ || exit 1
done
cd ../ || exit 1
rm -rf flyenv-created-project
```

Update only the macOS/Linux scripts. This shell-level fallback avoids the non-portable `rename` command while invoking the platform's native rename fast path through `mv` for every direct child.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `yarn test:php-project-directory`

Expected: all static-script assertions pass.

### Task 5: Verify Lifecycle, Platform Contracts, and the Final Surface

**Files:**
- Verify: `scripts/php-project-directory-test.ts`
- Verify: `src/fork/module/Project/ProjectDirMover.ts`
- Verify: `src/fork/module/Project/index.ts`
- Verify: `src/render/components/Host/CreateProject/PhpProjectCreateController.ts`
- Verify: `src/render/components/Host/CreateProject/phpCreate.vue`
- Verify: `src/render/components/Host/CreateProject/phpCreate.win.vue`
- Verify: `src/render/components/Host/CreateProject/project.ts`
- Verify: `scripts/renderer-operation-boundaries-test.ts`
- Verify: `static/sh/macOS/project-new.sh`
- Verify: `static/sh/Linux/project-new.sh`

- [ ] **Step 1: Run the focused regression suite**

Run: `yarn test:php-project-directory`

Expected: `php project directory tests passed` with hidden-file, directory-merge, failed-move, renderer, fork, and static-script assertions.

- [ ] **Step 2: Run the module-boundary guard**

Run: `yarn test:renderer-operation-boundaries`

Expected: zero violations; the long-running PHP creation operation has a controller owner and the entry dialogs only bind state and commands.

- [ ] **Step 3: Type-check and lint changed TypeScript and Vue files**

Run:

```sh
yarn vue-tsc --noEmit
yarn eslint src/fork/module/Project/ProjectDirMover.ts src/fork/module/Project/index.ts src/render/components/Host/CreateProject/PhpProjectCreateController.ts src/render/components/Host/CreateProject/phpCreate.vue src/render/components/Host/CreateProject/phpCreate.win.vue src/render/components/Host/CreateProject/project.ts scripts/php-project-directory-test.ts
```

Expected: zero type and lint errors.

- [ ] **Step 4: Perform platform smoke tests**

On macOS, Linux, and Windows, choose a new empty directory and create a Laravel project. Confirm `.env`, `.gitignore`, `.gitattributes`, `.editorconfig`, the `vendor` directory, and `public/index.php` all exist in the selected directory, while `flyenv-create-project` does not. Repeat once with a pre-existing `vendor/existing.txt` to verify directory merging. Start another creation and cancel it before Composer finishes; confirm no fork migration occurs after cancellation.

- [ ] **Step 5: Commit the implementation**

```bash
git add package.json scripts/php-project-directory-test.ts scripts/renderer-operation-boundaries-test.ts src/fork/module/Project/ProjectDirMover.ts src/fork/module/Project/index.ts src/render/components/Host/CreateProject/PhpProjectCreateController.ts src/render/components/Host/CreateProject/phpCreate.vue src/render/components/Host/CreateProject/phpCreate.win.vue src/render/components/Host/CreateProject/project.ts static/sh/macOS/project-new.sh static/sh/Linux/project-new.sh docs/superpowers/specs/2026-08-30-php-project-directory-move-design.md docs/superpowers/plans/2026-08-30-php-project-directory-move.md
git commit -m "fix: preserve PHP project hidden files"
```
