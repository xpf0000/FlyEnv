# AI CLI Tabs Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Antigravity skills tab, Codex plugin actions, AI CLI MCP table truncation, and Copilot skills workbench behavior with existing FlyEnv UI patterns.

**Architecture:** Keep data contracts intact and localize most changes to the renderer. Reuse the existing Host popover menu pattern and the current Antigravity/Hermes skill drawer structure, while adding one narrow Electron file-access IPC helper so the Copilot skill drawer can switch cleanly between editable and read-only modes.

**Tech Stack:** TypeScript, Vue 3 SFCs, Element Plus, Tailwind utility classes, Electron shell/fs IPC utilities, Monaco Editor, markdown renderer, `tsx`, ESLint, `vue-tsc`

---

## File Structure

- Create: `src/shared/copilotCliSkills.ts`
  Purpose: hold pure helpers for Copilot skill directory resolution and root-folder inference so the renderer logic is easy to test without booting the app.
- Create: `scripts/copilot-cli-skills-workbench-test.ts`
  Purpose: regression-test Copilot skill path and root inference behavior for POSIX and Windows-style paths.
- Create: `src/render/components/CopilotCli/SkillView.vue`
  Purpose: provide the Copilot skill code/both/preview drawer with conditional save behavior.
- Modify: `src/main/core/AppNodeFn.ts`
  Purpose: expose a narrow `fs_access` IPC handler that checks read/write capability for a local path.
- Modify: `src/render/util/NodeFn.ts`
  Purpose: expose the renderer-side `fs.access(path, mode)` helper consumed by the Copilot skill drawer.
- Modify: `src/render/components/CopilotCli/setup.ts`
  Purpose: add Copilot skill directory actions, drawer launch logic, and shared viewer tab state.
- Modify: `src/render/components/CopilotCli/Skills.vue`
  Purpose: replace copy-only actions with a Host-style popover menu and add the header folder button.
- Modify: `src/lang/en/copilot-cli.json`
  Purpose: add the English labels and fallback messages used by the Copilot skills workbench.
- Modify: `src/lang/zh/copilot-cli.json`
  Purpose: add simplified Chinese labels for the Copilot skills workbench.
- Modify: `src/lang/zh-hant/copilot-cli.json`
  Purpose: add traditional Chinese labels for the Copilot skills workbench.
- Modify: `src/render/components/Antigravity/Skills.vue`
  Purpose: replace inline skill action icons with the project’s common popover action menu.
- Modify: `src/render/components/Codex/Plugins.vue`
  Purpose: switch Codex plugin actions from circle icon buttons to the same link-style actions used by Claude Code.
- Modify: `src/render/components/Antigravity/MCP.vue`
  Purpose: render `name`, `type`, and `command / URL` as single-line truncated cells with table-level tooltips.
- Modify: `src/render/components/ClaudeCode/MCP.vue`
  Purpose: render `name`, `type`, and `command / URL` as single-line truncated cells with table-level tooltips.
- Modify: `src/render/components/Codex/MCP.vue`
  Purpose: render `name`, `type`, and `command / URL` as single-line truncated cells with table-level tooltips.
- Modify: `src/render/components/CopilotCli/MCP.vue`
  Purpose: render `name`, `type`, and `command / URL` as single-line truncated cells with table-level tooltips.

### Task 1: Add the Failing Copilot Skill Path Regression Test

**Files:**
- Create: `scripts/copilot-cli-skills-workbench-test.ts`
- Test: `scripts/copilot-cli-skills-workbench-test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict'
import {
  getCopilotCliSkillDir,
  getCopilotCliSkillsRoot
} from '../src/shared/copilotCliSkills'

assert.equal(
  getCopilotCliSkillDir('/Users/dev/.copilot/skills/reviewer/SKILL.md'),
  '/Users/dev/.copilot/skills/reviewer'
)

assert.equal(
  getCopilotCliSkillDir('C:\\Users\\dev\\.copilot\\skills\\reviewer\\SKILL.md'),
  'C:\\Users\\dev\\.copilot\\skills\\reviewer'
)

assert.equal(
  getCopilotCliSkillsRoot(
    [{ name: 'reviewer', description: '', path: '/Users/dev/.copilot/skills/reviewer/SKILL.md' }],
    '/Users/dev'
  ),
  '/Users/dev/.copilot/skills'
)

assert.equal(getCopilotCliSkillsRoot([], '/Users/dev'), '/Users/dev/.copilot')

console.log('copilot-cli-skills-workbench-test: ok')
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx tsx scripts/copilot-cli-skills-workbench-test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` or an equivalent import failure because `src/shared/copilotCliSkills.ts` does not exist yet.

### Task 2: Implement the Copilot Skill Path Helper

**Files:**
- Create: `src/shared/copilotCliSkills.ts`
- Test: `scripts/copilot-cli-skills-workbench-test.ts`

- [ ] **Step 1: Write the minimal helper**

```ts
export interface CopilotCliSkillLike {
  name: string
  description: string
  path: string
}

export function getCopilotCliSkillDir(skillPath: string): string {
  const normalized = skillPath.replace(/[\\/]+$/, '')
  const slashIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return slashIndex >= 0 ? normalized.slice(0, slashIndex) : normalized
}

export function getCopilotCliSkillsRoot(
  skills: CopilotCliSkillLike[],
  homeDir: string
): string {
  const firstPath = skills.find((item) => item.path?.trim())?.path
  if (!firstPath) {
    return `${homeDir}/.copilot`
  }
  return getCopilotCliSkillDir(getCopilotCliSkillDir(firstPath))
}
```

- [ ] **Step 2: Run the regression test to verify it passes**

Run:

```bash
npx tsx scripts/copilot-cli-skills-workbench-test.ts
```

Expected: PASS with `copilot-cli-skills-workbench-test: ok`.

- [ ] **Step 3: Commit the helper and regression test**

```bash
git add src/shared/copilotCliSkills.ts scripts/copilot-cli-skills-workbench-test.ts
git commit -m "test: add copilot skill path helper coverage"
```

### Task 3: Wire the Copilot Skills Tab to the New Workbench Actions

**Files:**
- Modify: `src/render/components/CopilotCli/Skills.vue`
- Modify: `src/render/components/CopilotCli/setup.ts`
- Modify: `src/lang/en/copilot-cli.json`
- Modify: `src/lang/zh/copilot-cli.json`
- Modify: `src/lang/zh-hant/copilot-cli.json`
- Test: `src/render/components/CopilotCli/Skills.vue`

- [ ] **Step 1: Change the Copilot skills template to use the missing workbench actions first**

Replace the current copy-only action block in `src/render/components/CopilotCli/Skills.vue` with this structure:

```vue
<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header gap-4">
        <div class="flex items-center gap-2">
          <span>{{ I18nT('copilotCli.skills') }}</span>
          <el-tooltip :content="I18nT('copilotCli.openSkillsDir')" placement="top">
            <el-button link @click="CopilotCliSetup.openSkillsDir()">
              <FolderOpened class="w-[18px] h-[18px]" />
            </el-button>
          </el-tooltip>
        </div>
        <el-button
          link
          :disabled="CopilotCliSetup.skillsLoading"
          @click="CopilotCliSetup.refreshSkills()"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="w-[24px] h-[24px]"
            :class="{ 'fa-spin': CopilotCliSetup.skillsLoading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>

    <div class="w-full h-full overflow-hidden">
      <div v-loading="CopilotCliSetup.skillsLoading" class="p-5 h-full overflow-hidden flex flex-col">
        <el-scrollbar v-if="CopilotCliSetup.skills.length > 0">
          <div
            v-for="item in CopilotCliSetup.skills"
            :key="item.path || item.name"
            class="skill-row"
          >
            <div class="skill-info">
              <div class="skill-title">
                <span class="name">{{ item.name }}</span>
              </div>
              <div class="skill-desc">
                <el-tooltip
                  :content="item.description || item.path"
                  placement="top"
                  :show-after="300"
                >
                  <span>{{ item.description || item.path }}</span>
                </el-tooltip>
              </div>
            </div>

            <div class="skill-actions">
              <el-popover
                effect="dark"
                popper-class="host-list-poper"
                placement="left-start"
                width="auto"
                :show-arrow="false"
              >
                <ul v-poper-fix class="host-list-menu">
                  <li v-if="item.path" @click.stop="CopilotCliSetup.openSkillDir(item)">
                    <yb-icon :svg="import('@/svg/folder.svg?raw')" width="13" height="13" />
                    <span class="ml-3">{{ I18nT('copilotCli.openSkillDir') }}</span>
                  </li>
                  <li v-if="item.path" @click.stop="CopilotCliSetup.revealSkillFile(item)">
                    <yb-icon :svg="import('@/svg/fileinfo.svg?raw')" width="13" height="13" />
                    <span class="ml-3">{{ I18nT('copilotCli.revealSkillFile') }}</span>
                  </li>
                  <li @click.stop="CopilotCliSetup.viewSkill(item)">
                    <yb-icon :svg="import('@/svg/eye.svg?raw')" width="13" height="13" />
                    <span class="ml-3">{{ I18nT('base.preview') }}</span>
                  </li>
                </ul>

                <template #reference>
                  <div class="flex justify-center">
                    <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
                  </div>
                </template>
              </el-popover>
            </div>
          </div>
        </el-scrollbar>
        <el-empty
          v-else-if="!CopilotCliSetup.skillsLoading"
          :description="I18nT('copilotCli.noSkills')"
        />
      </div>
    </div>
  </el-card>
</template>

<script lang="ts" setup>
  import { onMounted } from 'vue'
  import { FolderOpened } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import { CopilotCliSetup } from './setup'

  onMounted(() => {
    CopilotCliSetup.refreshSkills()
  })
</script>
```

- [ ] **Step 2: Run type-checking to verify it fails before the setup methods exist**

Run:

```bash
npx vue-tsc --noEmit --pretty false
```

Expected: FAIL with diagnostics showing that `CopilotCliSetup` does not yet expose `openSkillsDir`, `openSkillDir`, `revealSkillFile`, `viewSkill`, or `skillViewTab`.

- [ ] **Step 3: Implement the missing setup methods and locale keys**

At the top of `src/render/components/CopilotCli/setup.ts`, add the new imports and lazy drawer reference:

```ts
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { app, shell, clipboard } from '@/util/NodeFn'
import { getCopilotCliSkillDir, getCopilotCliSkillsRoot } from '@shared/copilotCliSkills'

let SkillViewVM: any
```

Inside the `CopilotCli` class, add the shared viewer tab state and the four new methods:

```ts
  skillViewTab: 'code' | 'both' | 'preview' = 'both'

  async openSkillsDir() {
    const home = await app.getPath('home')
    const dir = getCopilotCliSkillsRoot(this.skills, home)
    shell.openPath(dir).catch()
  }

  openSkillDir(item: SkillItem) {
    if (!item.path) {
      return
    }
    shell.openPath(getCopilotCliSkillDir(item.path)).catch()
  }

  revealSkillFile(item: SkillItem) {
    if (!item.path) {
      return
    }
    shell.showItemInFolder(item.path).catch()
  }

  viewSkill(item: SkillItem) {
    const showDrawer = () => {
      AsyncComponentShow(SkillViewVM, { skill: item }).then()
    }

    if (!SkillViewVM) {
      import('./SkillView.vue').then((res) => {
        SkillViewVM = res.default
        showDrawer()
      })
      return
    }

    showDrawer()
  }
```

Append these keys to the three Copilot locale files:

```json
// src/lang/en/copilot-cli.json
{
  "openSkillsDir": "Open skills directory",
  "openSkillDir": "Open skill directory",
  "revealSkillFile": "Reveal skill file",
  "skillFileMissing": "Skill file not found",
  "skillLoadFailed": "Failed to load skill file"
}
```

```json
// src/lang/zh/copilot-cli.json
{
  "openSkillsDir": "打开技能目录",
  "openSkillDir": "打开技能文件夹",
  "revealSkillFile": "定位技能文件",
  "skillFileMissing": "未找到技能文件",
  "skillLoadFailed": "加载技能文件失败"
}
```

```json
// src/lang/zh-hant/copilot-cli.json
{
  "openSkillsDir": "打開技能目錄",
  "openSkillDir": "打開技能資料夾",
  "revealSkillFile": "定位技能檔案",
  "skillFileMissing": "找不到技能檔案",
  "skillLoadFailed": "載入技能檔案失敗"
}
```

- [ ] **Step 4: Re-run scoped lint and type-checking**

Run:

```bash
npx eslint src/shared/copilotCliSkills.ts src/render/components/CopilotCli/setup.ts src/render/components/CopilotCli/Skills.vue
npx vue-tsc --noEmit --pretty false
```

Expected: `eslint` exits cleanly for the touched files, and `vue-tsc` no longer reports missing Copilot skills workbench methods. If the repo still has unrelated baseline diagnostics elsewhere, verify there are no new diagnostics attributed to the touched Copilot files.

- [ ] **Step 5: Commit the Copilot skills tab wiring**

```bash
git add src/shared/copilotCliSkills.ts src/render/components/CopilotCli/setup.ts src/render/components/CopilotCli/Skills.vue src/lang/en/copilot-cli.json src/lang/zh/copilot-cli.json src/lang/zh-hant/copilot-cli.json
git commit -m "feat: add copilot skill workbench actions"
```

### Task 4: Add File Access IPC and Build the Copilot Skill Drawer

**Files:**
- Modify: `src/main/core/AppNodeFn.ts`
- Modify: `src/render/util/NodeFn.ts`
- Create: `src/render/components/CopilotCli/SkillView.vue`
- Test: `src/render/components/CopilotCli/SkillView.vue`

- [ ] **Step 1: Create the drawer component first so it fails on the missing `fs.access()` helper**

Create `src/render/components/CopilotCli/SkillView.vue` using the Antigravity drawer structure with Copilot-specific state and access checks:

```vue
<template>
  <el-drawer
    v-model="show"
    :with-header="false"
    size="80%"
    :destroy-on-close="true"
    :close-on-click-modal="false"
    class="host-edit-drawer"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav px-3 pr-5 overflow-hidden flex items-center">
        <div class="flex flex-s items-center gap-3">
          <yb-icon
            :svg="import('@/svg/delete.svg?raw')"
            class="w-[24px] h-[24px] p-[3px] cursor-pointer hover:text-yellow-500"
            @click="show = false"
          />
          <span class="truncate">{{ props.skill.name }}</span>
        </div>
        <div class="flex-shrink-0 flex items-center gap-2">
          <div
            :class="{ 'hover:bg-gray-200': tab !== 'code', 'bg-gray-300': tab === 'code' }"
            class="w-[28px] h-[28px] rounded-[4px] flex items-center justify-center"
            @click.stop="tab = 'code'"
          >
            <yb-icon
              :svg="import('@/svg/markdown-left.svg?raw')"
              class="w-[22px] h-[22px] p-[2px] cursor-pointer hover:text-yellow-500"
            />
          </div>
          <div
            :class="{ 'hover:bg-gray-200': tab !== 'both', 'bg-gray-300': tab === 'both' }"
            class="w-[28px] h-[28px] rounded-[4px] flex items-center justify-center"
            @click.stop="tab = 'both'"
          >
            <yb-icon
              :svg="import('@/svg/markdown-center.svg?raw')"
              :raw-color="true"
              class="w-[28px] h-[28px] p-[2px] cursor-pointer hover:text-yellow-500"
            />
          </div>
          <div
            :class="{ 'hover:bg-gray-200': tab !== 'preview', 'bg-gray-300': tab === 'preview' }"
            class="w-[28px] h-[28px] rounded-[4px] flex items-center justify-center"
            @click.stop="tab = 'preview'"
          >
            <Picture class="w-[23px] h-[23px] p-[2px] cursor-pointer hover:text-yellow-500" />
          </div>
          <div
            class="w-[28px] h-[28px] ml-3 rounded-[4px] flex items-center justify-center hover:bg-gray-200"
            @click.stop="doSave"
          >
            <el-badge is-dot :offset="[-3, 5]" :hidden="!hasChanged">
              <yb-icon
                :svg="import('@/svg/save.svg?raw')"
                :raw-color="true"
                :class="{ 'opacity-50': !canSave }"
                class="w-[23px] h-[23px] p-[2px] cursor-pointer hover:text-yellow-500"
              />
            </el-badge>
          </div>
        </div>
      </div>

      <div ref="mainRef" class="skill-view-content flex-1 overflow-hidden flex">
        <div v-show="tab !== 'preview'" class="left" :style="leftStyle">
          <div ref="editorRef" class="editor"></div>
        </div>
        <div v-show="tab === 'both'" class="handle" @mousedown.stop="handleMoveMouseDown"></div>
        <div
          v-show="tab !== 'code'"
          class="flex-1 h-full overflow-hidden bg-white dark:bg-slate-900 rounded-md"
        >
          <el-scrollbar class="p-5">
            <div class="vp-doc select-text pointer-events-auto" v-html="html"></div>
          </el-scrollbar>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
  import { editor, KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { Picture } from '@element-plus/icons-vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { EditorConfigMake, EditorCreate, EditorDestroy } from '@/util/Editor'
  import { fs, md } from '@/util/NodeFn'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { I18nT } from '@lang/index'
  import { CopilotCliSetup, type SkillItem } from './setup'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const props = defineProps<{ skill: SkillItem }>()

  const tab = computed({
    get: () => CopilotCliSetup.skillViewTab,
    set: (value) => {
      CopilotCliSetup.skillViewTab = value
    }
  })

  const canSave = ref(false)
  const content = ref('')
  const contentBackup = ref('')
  const html = ref('')
  const editorRef = ref<HTMLElement>()
  const mainRef = ref<HTMLElement>()
  const leftStyle = ref({ width: '50%', flex: 'unset' })
  let monacoEditor: editor.IStandaloneCodeEditor | undefined

  const hasChanged = computed(() => canSave.value && content.value !== contentBackup.value)

  watch(
    tab,
    (value) => {
      leftStyle.value.width = value === 'code' ? '100%' : '50%'
    },
    { immediate: true }
  )

  watch(content, async () => {
    html.value = content.value ? await md.render(content.value) : ''
  })

  async function initEditor() {
    if (!editorRef.value) return
    const config = await EditorConfigMake(content.value, !canSave.value, 'on', 'markdown')
    monacoEditor = EditorCreate(editorRef.value, config)
    monacoEditor?.addAction({
      id: 'save',
      label: 'save',
      keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
      run: () => doSave()
    })
    monacoEditor?.onDidChangeModelContent(() => {
      content.value = monacoEditor?.getValue() ?? ''
    })
  }

  onMounted(async () => {
    try {
      const filePath = props.skill.path
      const exists = await fs.existsSync(filePath)
      if (!exists) {
        content.value = `# ${I18nT('copilotCli.skillFileMissing')}`
      } else {
        const readable = await fs.access(filePath, 'r')
        const writable = await fs.access(filePath, 'w')
        if (!readable) {
          content.value = `# ${I18nT('copilotCli.skillLoadFailed')}`
        } else {
          content.value = await fs.readFile(filePath)
          canSave.value = writable
        }
      }
    } catch {
      content.value = `# ${I18nT('copilotCli.skillLoadFailed')}`
      canSave.value = false
    }

    contentBackup.value = content.value
    await nextTick()
    await initEditor()
  })

  onUnmounted(() => {
    EditorDestroy(monacoEditor)
  })

  let wrapperRect: DOMRect = new DOMRect()
  const maskDom = document.createElement('div')
  maskDom.classList.add('app-move-mask')

  const mouseMove = (event: MouseEvent) => {
    event.preventDefault()
    const left = event.clientX - wrapperRect.left - 5
    leftStyle.value = { width: `${left}px`, flex: 'unset' }
  }

  const mouseUp = () => {
    document.removeEventListener('mousemove', mouseMove)
    document.removeEventListener('mouseup', mouseUp)
    maskDom.remove()
  }

  const handleMoveMouseDown = (event: MouseEvent) => {
    event.preventDefault()
    wrapperRect = (mainRef.value as HTMLElement).getBoundingClientRect()
    document.body.append(maskDom)
    document.addEventListener('mousemove', mouseMove)
    document.addEventListener('mouseup', mouseUp)
  }

  async function doSave() {
    if (!canSave.value || !hasChanged.value) return
    const nextContent = monacoEditor?.getValue() ?? content.value
    try {
      await fs.writeFile(props.skill.path, nextContent)
      content.value = nextContent
      contentBackup.value = nextContent
      MessageSuccess(I18nT('base.success'))
    } catch (error) {
      MessageError(`${error}`)
    }
  }

  defineExpose({ show, onSubmit, onClosed })
</script>

<style scoped>
  .left {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor {
    flex: 1;
    overflow: hidden;
  }

  .handle {
    width: 5px;
    cursor: col-resize;
    background: #ddd;
    flex-shrink: 0;
  }
</style>
```

- [ ] **Step 2: Run type-checking to verify the missing `fs.access()` helper breaks the build first**

Run:

```bash
npx vue-tsc --noEmit --pretty false
```

Expected: FAIL with diagnostics showing that `fs.access` does not exist on the renderer-side `fs` helper yet.

- [ ] **Step 3: Add the minimal read/write access IPC helper**

Update the imports and new method in `src/main/core/AppNodeFn.ts`:

```ts
import {
  type FSWatcher,
  rm,
  stat,
  existsSync,
  watch,
  createReadStream,
  constants
} from 'node:fs'
import { readdir, access as fsAccess } from 'node:fs/promises'
```

```ts
  fs_access(command: string, key: string, path: string, mode: 'r' | 'w' | 'rw' = 'r') {
    path = pathFixedToUnix(path)
    const accessMode =
      mode === 'rw' ? constants.R_OK | constants.W_OK : mode === 'w' ? constants.W_OK : constants.R_OK

    fsAccess(path, accessMode)
      .then(() => {
        this?.mainWindow?.webContents.send('command', command, key, true)
      })
      .catch(() => {
        this?.mainWindow?.webContents.send('command', command, key, false)
      })
  }
```

Expose the renderer wrapper in `src/render/util/NodeFn.ts`:

```ts
export const fs = {
  chmod: createIPCCall<[path: string, mode: string | number], void>('fs', 'chmod'),
  remove: createIPCCall<[path: string], void>('fs', 'remove'),
  writeBufferBase64: createIPCCall<[path: string, data: string], void>('fs', 'writeBufferBase64'),
  readdir: createIPCCall<[dir: string, full?: boolean], string[]>('fs', 'readdir'),
  subdir: createIPCCall<[dir: string], string[]>('fs', 'subdir'),
  mkdirp: createIPCCall<[dir: string], void>('fs', 'mkdirp'),
  stat: createIPCCall<[path: string], Stats>('fs', 'stat'),
  copy: createIPCCall<[src: string, dest: string], void>('fs', 'copy'),
  copyFile: createIPCCall<[src: string, dest: string], void>('fs', 'copyFile'),
  existsSync: createIPCCall<[string], boolean>('fs', 'existsSync'),
  access: createIPCCall<[path: string, mode?: 'r' | 'w' | 'rw'], boolean>('fs', 'access'),
  readFile: createIPCCall<[path: string], string>('fs', 'readFile'),
  writeFile: createIPCCall<[path: string, data: string], void>('fs', 'writeFile'),
  realpath: createIPCCall<[path: string], string>('fs', 'realpath'),
  getFileHash: createIPCCall<
    [string, 'sha1' | 'sha256' | 'md5' | 'sha512' | 'sha512Base64'],
    string
  >('fs', 'getFileHash')
}
```

- [ ] **Step 4: Re-run scoped lint and type-checking**

Run:

```bash
npx eslint src/main/core/AppNodeFn.ts src/render/util/NodeFn.ts src/render/components/CopilotCli/SkillView.vue
npx vue-tsc --noEmit --pretty false
```

Expected: `eslint` exits cleanly for the touched files, and `vue-tsc` no longer reports that `fs.access` is missing. If the repo has unrelated baseline diagnostics elsewhere, verify there are no new diagnostics for `AppNodeFn.ts`, `NodeFn.ts`, or `CopilotCli/SkillView.vue`.

- [ ] **Step 5: Commit the access helper and Copilot drawer**

```bash
git add src/main/core/AppNodeFn.ts src/render/util/NodeFn.ts src/render/components/CopilotCli/SkillView.vue
git commit -m "feat: add copilot skill preview drawer"
```

### Task 5: Convert Antigravity Skill Actions to the Common Popover Menu

**Files:**
- Modify: `src/render/components/Antigravity/Skills.vue`
- Test: `src/render/components/Antigravity/Skills.vue`

- [ ] **Step 1: Replace the inline action buttons with the Host-style action menu**

In `src/render/components/Antigravity/Skills.vue`, replace the existing `.skill-actions` button group with:

```vue
<div class="skill-actions">
  <el-popover
    effect="dark"
    popper-class="host-list-poper"
    placement="left-start"
    width="auto"
    :show-arrow="false"
  >
    <ul v-poper-fix class="host-list-menu">
      <li @click.stop="AntigravitySetup.openSkillDir(item)">
        <yb-icon :svg="import('@/svg/folder.svg?raw')" width="13" height="13" />
        <span class="ml-3">{{ I18nT('antigravity.openSkillDir') }}</span>
      </li>
      <li @click.stop="AntigravitySetup.revealSkillFile(item)">
        <yb-icon :svg="import('@/svg/fileinfo.svg?raw')" width="13" height="13" />
        <span class="ml-3">{{ I18nT('antigravity.revealSkillFile') }}</span>
      </li>
      <li @click.stop="AntigravitySetup.viewSkill(item)">
        <yb-icon :svg="import('@/svg/eye.svg?raw')" width="13" height="13" />
        <span class="ml-3">{{ I18nT('base.preview') }}</span>
      </li>
    </ul>

    <template #reference>
      <div class="flex justify-center">
        <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
      </div>
    </template>
  </el-popover>
</div>
```

- [ ] **Step 2: Run scoped lint for the updated skills view**

Run:

```bash
npx eslint src/render/components/Antigravity/Skills.vue
```

Expected: exit `0`.

- [ ] **Step 3: Manually verify the Antigravity skills interaction**

Check these behaviors in the running app:

```text
1. The Antigravity skills rows now use a "more" action menu instead of three inline icons.
2. Open skill directory still opens the containing folder.
3. Reveal skill file still highlights the target file.
4. Preview still opens the existing Antigravity skill drawer.
```

- [ ] **Step 4: Commit the Antigravity action-menu alignment**

```bash
git add src/render/components/Antigravity/Skills.vue
git commit -m "feat: align antigravity skill actions"
```

### Task 6: Match Codex Plugin Actions to Claude Code

**Files:**
- Modify: `src/render/components/Codex/Plugins.vue`
- Test: `src/render/components/Codex/Plugins.vue`

- [ ] **Step 1: Replace the circle plugin buttons with Claude Code-style link actions**

In `src/render/components/Codex/Plugins.vue`, replace the installed/available action block with:

```vue
<div class="plugin-actions">
  <template v-if="item.installed">
    <el-tooltip
      v-if="item.enabled"
      :content="I18nT('codex.disable')"
      placement="top"
      :show-after="300"
    >
      <el-button
        link
        :icon="VideoPause"
        @click="CodexSetup.disablePlugin(item.pluginId)"
      />
    </el-tooltip>
    <el-tooltip
      v-else
      :content="I18nT('codex.enable')"
      placement="top"
      :show-after="300"
    >
      <el-button
        link
        type="success"
        :icon="VideoPlay"
        @click="CodexSetup.enablePlugin(item.pluginId)"
      />
    </el-tooltip>
    <el-tooltip
      :content="I18nT('codex.uninstall')"
      placement="top"
      :show-after="300"
    >
      <el-button
        link
        type="danger"
        :icon="Delete"
        @click="confirmUninstall(item.pluginId)"
      />
    </el-tooltip>
  </template>
  <template v-else>
    <el-tooltip :content="I18nT('base.install')" placement="top" :show-after="300">
      <el-button
        link
        type="primary"
        :icon="Download"
        @click="installPlugin(item.pluginId)"
      />
    </el-tooltip>
  </template>
</div>
```

- [ ] **Step 2: Run scoped lint on the Codex plugin view**

Run:

```bash
npx eslint src/render/components/Codex/Plugins.vue
```

Expected: exit `0`.

- [ ] **Step 3: Manually compare Codex and Claude Code plugin rows**

Check these behaviors in the running app:

```text
1. Codex plugin actions now render as link-style actions instead of circle buttons.
2. Enable, disable, uninstall, and install still trigger the same behavior as before.
3. The action spacing and visual weight match Claude Code closely enough that the two tabs read as the same pattern.
```

- [ ] **Step 4: Commit the Codex plugin alignment**

```bash
git add src/render/components/Codex/Plugins.vue
git commit -m "feat: align codex plugin actions"
```

### Task 7: Add Tailwind Truncation to the AI CLI MCP Tables

**Files:**
- Modify: `src/render/components/Antigravity/MCP.vue`
- Modify: `src/render/components/ClaudeCode/MCP.vue`
- Modify: `src/render/components/Codex/MCP.vue`
- Modify: `src/render/components/CopilotCli/MCP.vue`
- Test: `src/render/components/Antigravity/MCP.vue`
- Test: `src/render/components/ClaudeCode/MCP.vue`
- Test: `src/render/components/Codex/MCP.vue`
- Test: `src/render/components/CopilotCli/MCP.vue`

- [ ] **Step 1: Update `Antigravity/MCP.vue` to use table-level tooltips and `truncate` cell wrappers**

```vue
<el-table :data="AntigravitySetup.mcpServers" style="width: 100%" show-overflow-tooltip>
  <el-table-column :label="I18nT('antigravity.mcpName')" width="180">
    <template #default="{ row }">
      <div class="min-w-0 truncate">{{ row.name }}</div>
    </template>
  </el-table-column>
  <el-table-column :label="I18nT('antigravity.mcpType')" width="100">
    <template #default="{ row }">
      <div class="min-w-0 truncate">{{ row.type }}</div>
    </template>
  </el-table-column>
  <el-table-column :label="I18nT('antigravity.mcpCommandOrUrl')">
    <template #default="{ row }">
      <div class="min-w-0 truncate">{{ row.commandOrUrl }}</div>
    </template>
  </el-table-column>
  <el-table-column prop="scope" :label="I18nT('antigravity.mcpScope')" width="100" />
  <el-table-column :label="I18nT('base.action')" width="100" align="center">
    <template #default="{ row }">
      <el-button link type="danger" @click="confirmRemove(row.name)">
        {{ I18nT('base.del') }}
      </el-button>
    </template>
  </el-table-column>
</el-table>
```

- [ ] **Step 2: Apply the same `truncate` pattern to `ClaudeCode/MCP.vue`**

```vue
<el-table :data="ClaudeCodeSetup.mcpServers" style="width: 100%" show-overflow-tooltip>
  <el-table-column :label="I18nT('claudeCode.mcpName')" width="180">
    <template #default="{ row }">
      <div class="min-w-0 truncate">{{ row.name }}</div>
    </template>
  </el-table-column>
  <el-table-column :label="I18nT('claudeCode.mcpType')" width="100">
    <template #default="{ row }">
      <div class="min-w-0 truncate">{{ row.type }}</div>
    </template>
  </el-table-column>
  <el-table-column :label="I18nT('claudeCode.mcpCommandOrUrl')">
    <template #default="{ row }">
      <div class="min-w-0 truncate">{{ row.commandOrUrl }}</div>
    </template>
  </el-table-column>
  <el-table-column prop="scope" :label="I18nT('claudeCode.mcpScope')" width="100" />
  <el-table-column :label="I18nT('base.action')" width="100" align="center">
    <template #default="{ row }">
      <el-button link type="danger" @click="confirmRemove(row.name)">
        {{ I18nT('base.del') }}
      </el-button>
    </template>
  </el-table-column>
</el-table>
```

- [ ] **Step 3: Apply the same `truncate` pattern to `Codex/MCP.vue`**

```vue
<el-table :data="CodexSetup.mcpServers" style="width: 100%" show-overflow-tooltip>
  <el-table-column :label="I18nT('codex.mcpName')" width="180">
    <template #default="{ row }">
      <div class="min-w-0 truncate">{{ row.name }}</div>
    </template>
  </el-table-column>
  <el-table-column :label="I18nT('codex.mcpType')" width="100">
    <template #default="{ row }">
      <div class="min-w-0 truncate">{{ row.type }}</div>
    </template>
  </el-table-column>
  <el-table-column :label="I18nT('codex.mcpCommandOrUrl')">
    <template #default="{ row }">
      <div class="min-w-0 truncate">{{ row.commandOrUrl }}</div>
    </template>
  </el-table-column>
  <el-table-column prop="scope" :label="I18nT('codex.mcpScope')" width="100" />
  <el-table-column :label="I18nT('base.action')" width="100" align="center">
    <template #default="{ row }">
      <el-button link type="danger" @click="confirmRemove(row.name)">
        {{ I18nT('base.del') }}
      </el-button>
    </template>
  </el-table-column>
</el-table>
```

- [ ] **Step 4: Apply the same `truncate` pattern to `CopilotCli/MCP.vue`**

```vue
<el-table :data="CopilotCliSetup.mcpServers" style="width: 100%" show-overflow-tooltip>
  <el-table-column :label="I18nT('copilotCli.mcpName')" width="180">
    <template #default="{ row }">
      <div class="min-w-0 truncate">{{ row.name }}</div>
    </template>
  </el-table-column>
  <el-table-column :label="I18nT('copilotCli.mcpType')" width="100">
    <template #default="{ row }">
      <div class="min-w-0 truncate">{{ row.type }}</div>
    </template>
  </el-table-column>
  <el-table-column :label="I18nT('copilotCli.mcpCommandOrUrl')">
    <template #default="{ row }">
      <div class="min-w-0 truncate">{{ row.commandOrUrl }}</div>
    </template>
  </el-table-column>
  <el-table-column prop="scope" :label="I18nT('copilotCli.mcpScope')" width="100" />
  <el-table-column :label="I18nT('base.action')" width="100" align="center">
    <template #default="{ row }">
      <el-button link type="danger" @click="confirmRemove(row.name)">
        {{ I18nT('base.del') }}
      </el-button>
    </template>
  </el-table-column>
</el-table>
```

- [ ] **Step 5: Run scoped lint for the four MCP tables**

Run:

```bash
npx eslint src/render/components/Antigravity/MCP.vue src/render/components/ClaudeCode/MCP.vue src/render/components/Codex/MCP.vue src/render/components/CopilotCli/MCP.vue
```

Expected: exit `0`.

- [ ] **Step 6: Manually verify the MCP table layout**

Check these behaviors in the running app:

```text
1. Antigravity, Claude Code, Codex, and Copilot MCP tables all keep Name, Type, and Command / URL on one line.
2. Long values show ellipsis rather than wrapping.
3. Hovering truncated cells still reveals the full value through Element Plus tooltips.
4. Scope and delete actions still render and behave exactly as before.
```

- [ ] **Step 7: Commit the MCP table truncation update**

```bash
git add src/render/components/Antigravity/MCP.vue src/render/components/ClaudeCode/MCP.vue src/render/components/Codex/MCP.vue src/render/components/CopilotCli/MCP.vue
git commit -m "feat: truncate ai cli mcp table cells"
```

### Task 8: Run Final Verification Across the Full Alignment Change

**Files:**
- Test: `scripts/copilot-cli-skills-workbench-test.ts`
- Test: `src/main/core/AppNodeFn.ts`
- Test: `src/render/util/NodeFn.ts`
- Test: `src/render/components/CopilotCli/setup.ts`
- Test: `src/render/components/CopilotCli/Skills.vue`
- Test: `src/render/components/CopilotCli/SkillView.vue`
- Test: `src/render/components/Antigravity/Skills.vue`
- Test: `src/render/components/Codex/Plugins.vue`
- Test: `src/render/components/Antigravity/MCP.vue`
- Test: `src/render/components/ClaudeCode/MCP.vue`
- Test: `src/render/components/Codex/MCP.vue`
- Test: `src/render/components/CopilotCli/MCP.vue`

- [ ] **Step 1: Re-run the Copilot helper regression script**

Run:

```bash
npx tsx scripts/copilot-cli-skills-workbench-test.ts
```

Expected: PASS with `copilot-cli-skills-workbench-test: ok`.

- [ ] **Step 2: Run scoped lint across every touched implementation file**

Run:

```bash
npx eslint src/main/core/AppNodeFn.ts src/render/util/NodeFn.ts src/shared/copilotCliSkills.ts src/render/components/CopilotCli/setup.ts src/render/components/CopilotCli/Skills.vue src/render/components/CopilotCli/SkillView.vue src/render/components/Antigravity/Skills.vue src/render/components/Codex/Plugins.vue src/render/components/Antigravity/MCP.vue src/render/components/ClaudeCode/MCP.vue src/render/components/Codex/MCP.vue src/render/components/CopilotCli/MCP.vue
```

Expected: exit `0`.

- [ ] **Step 3: Run repo type-checking and verify there are no new diagnostics in touched files**

Run:

```bash
npx vue-tsc --noEmit --pretty false
```

Expected: no diagnostics for the touched AI CLI alignment files. If the repo still has unrelated baseline diagnostics elsewhere, confirm they are pre-existing and not introduced by this work.

- [ ] **Step 4: Manually verify the user-facing workflow end to end**

Check these behaviors in the running app:

```text
1. Antigravity > Skills uses the Host-style popover action menu.
2. Codex > Plugins uses Claude Code-style link actions.
3. Antigravity / Claude Code / Codex / Copilot MCP tables truncate long Name, Type, and Command / URL values.
4. Copilot > Skills shows the header folder button.
5. Copilot skill rows can open the containing folder, reveal the skill file, and open the preview drawer.
6. A writable Copilot skill file can be edited and saved from the drawer.
7. A non-writable or unreadable Copilot skill stays readable when possible and never crashes the drawer.
```
