# Antigravity Skills Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Antigravity skills tab into a practical local skills workbench with directory shortcuts, file reveal actions, and a markdown editor/preview drawer.

**Architecture:** Keep Antigravity skill discovery in the fork process, extend the skill payload with an explicit `builtin` flag, and let the renderer use existing local file utilities for read/write/preview. Mirror the useful Hermes interaction model without adding Hermes-style install, reset, or remote browsing behavior.

**Tech Stack:** TypeScript, Vue 3 SFCs, Electron shell/fs IPC utilities, Monaco Editor, markdown renderer, `tsx` script regression test, ESLint, `vue-tsc`

---

## File Structure

- Create: `src/shared/antigravitySkills.ts`
  Purpose: hold pure helpers for skill title, containing directory, and editability so renderer logic is testable without UI bootstrapping.
- Create: `scripts/antigravity-skills-workbench-test.ts`
  Purpose: regression-test the pure Antigravity skill helper behavior for user vs built-in entries and cross-platform path splitting.
- Create: `src/render/components/Antigravity/SkillView.vue`
  Purpose: provide the code/both/preview drawer for viewing and editing local Antigravity skill markdown files.
- Modify: `src/fork/module/Antigravity/index.ts`
  Purpose: return `builtin` explicitly in skill list items and expose the user skills root directory.
- Modify: `src/render/components/Antigravity/setup.ts`
  Purpose: add typed skill actions for opening directories, revealing files, and opening the new drawer.
- Modify: `src/render/components/Antigravity/Skills.vue`
  Purpose: replace the copy-path-only list with Hermes-style file actions plus the new header folder button.
- Modify: `src/lang/en/antigravity.json`
  Purpose: add the minimal English labels needed by the new Antigravity skills actions and drawer.

### Task 1: Add the Failing Regression Test for Skill Helpers

**Files:**
- Create: `scripts/antigravity-skills-workbench-test.ts`
- Test: `scripts/antigravity-skills-workbench-test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict'
import {
  canEditAntigravitySkill,
  getAntigravitySkillDir,
  getAntigravitySkillTitle
} from '../src/shared/antigravitySkills'

assert.equal(
  getAntigravitySkillDir('/Users/x/.gemini/antigravity-cli/skills/reviewer/SKILL.md'),
  '/Users/x/.gemini/antigravity-cli/skills/reviewer'
)

assert.equal(
  getAntigravitySkillDir('C:\\Users\\x\\.gemini\\antigravity-cli\\builtin\\skills\\pair\\SKILL.md'),
  'C:\\Users\\x\\.gemini\\antigravity-cli\\builtin\\skills\\pair'
)

assert.equal(
  getAntigravitySkillTitle({
    name: 'reviewer',
    path: '/Users/x/.gemini/antigravity-cli/skills/reviewer/SKILL.md',
    builtin: false
  }),
  'reviewer'
)

assert.equal(
  getAntigravitySkillTitle({
    name: 'pair',
    path: '/Users/x/.gemini/antigravity-cli/builtin/skills/pair/SKILL.md',
    builtin: true
  }),
  'pair (built-in)'
)

assert.equal(
  canEditAntigravitySkill({
    name: 'reviewer',
    path: '/Users/x/.gemini/antigravity-cli/skills/reviewer/SKILL.md',
    builtin: false
  }),
  true
)

assert.equal(
  canEditAntigravitySkill({
    name: 'pair',
    path: '/Users/x/.gemini/antigravity-cli/builtin/skills/pair/SKILL.md',
    builtin: true
  }),
  false
)

console.log('antigravity-skills-workbench-test: ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/antigravity-skills-workbench-test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` or an equivalent import failure because `src/shared/antigravitySkills.ts` does not exist yet.

### Task 2: Implement the Shared Antigravity Skill Helper

**Files:**
- Create: `src/shared/antigravitySkills.ts`
- Test: `scripts/antigravity-skills-workbench-test.ts`

- [ ] **Step 1: Write the minimal helper**

```ts
export interface AntigravitySkillLike {
  name: string
  path: string
  builtin: boolean
}

export function getAntigravitySkillDir(skillPath: string): string {
  const normalized = skillPath.replace(/[\\/]+$/, '')
  const slashIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return slashIndex >= 0 ? normalized.slice(0, slashIndex) : normalized
}

export function getAntigravitySkillTitle(skill: AntigravitySkillLike): string {
  return skill.builtin ? `${skill.name} (built-in)` : skill.name
}

export function canEditAntigravitySkill(skill: AntigravitySkillLike): boolean {
  return !skill.builtin
}
```

- [ ] **Step 2: Run the regression test to verify it passes**

Run: `npx tsx scripts/antigravity-skills-workbench-test.ts`

Expected: PASS with `antigravity-skills-workbench-test: ok`

- [ ] **Step 3: Commit the helper and regression test**

```bash
git add src/shared/antigravitySkills.ts scripts/antigravity-skills-workbench-test.ts
git commit -m "test: add antigravity skill helper regression coverage"
```

### Task 3: Extend the Antigravity Skill Contract and Setup Actions

**Files:**
- Modify: `src/fork/module/Antigravity/index.ts`
- Modify: `src/render/components/Antigravity/setup.ts`
- Test: `scripts/antigravity-skills-workbench-test.ts`

- [ ] **Step 1: Add explicit `builtin` support in the fork module**

Update the Antigravity skill item type and list builder:

```ts
export interface AntigravitySkillItem {
  name: string
  description: string
  path: string
  builtin: boolean
  enabled: boolean
}

private async collectSkills(skillsDir: string, builtin: boolean, list: AntigravitySkillItem[]) {
  // existing directory scan logic stays the same
  list.push({
    name,
    description,
    path: skillPath,
    builtin,
    enabled: true
  })
}

openSkillsDir() {
  return new ForkPromise(async (resolve) => {
    resolve(join(this.antigravityHome(), 'skills'))
  })
}
```

- [ ] **Step 2: Update the renderer setup skill type and imports**

At the top of `src/render/components/Antigravity/setup.ts`, replace the current `SkillItem` shape and add the new helper imports:

```ts
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { shell } from '@/util/NodeFn'
import {
  getAntigravitySkillDir,
  type AntigravitySkillLike
} from '@shared/antigravitySkills'

let SkillViewVM: any

export interface SkillItem extends AntigravitySkillLike {
  description: string
  enabled: boolean
}
```

- [ ] **Step 3: Add skill actions to `AntigravitySetup`**

Add these members and methods to the class:

```ts
  skillViewTab: 'code' | 'both' | 'preview' = 'both'

  openSkillsDir() {
    IPC.send('app-fork:antigravity', 'openSkillsDir').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0 && res?.data) {
        shell.openPath(res.data).catch()
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
    })
  }

  openSkillDir(item: SkillItem) {
    shell.openPath(getAntigravitySkillDir(item.path)).catch()
  }

  revealSkillFile(item: SkillItem) {
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

- [ ] **Step 4: Run the regression test again**

Run: `npx tsx scripts/antigravity-skills-workbench-test.ts`

Expected: PASS with `antigravity-skills-workbench-test: ok`

- [ ] **Step 5: Commit the fork/setup contract update**

```bash
git add src/fork/module/Antigravity/index.ts src/render/components/Antigravity/setup.ts
git commit -m "feat: add antigravity skill file actions"
```

### Task 4: Build the Antigravity Skill Drawer

**Files:**
- Create: `src/render/components/Antigravity/SkillView.vue`
- Modify: `src/render/components/Antigravity/setup.ts`

- [ ] **Step 1: Create the drawer component**

Create `src/render/components/Antigravity/SkillView.vue` with the Hermes drawer structure adapted for Antigravity file paths:

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
          <span class="truncate">{{ title }}</span>
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
  import { AntigravitySetup, type SkillItem } from './setup'
  import {
    canEditAntigravitySkill,
    getAntigravitySkillTitle
  } from '@shared/antigravitySkills'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const props = defineProps<{ skill: SkillItem }>()

  const tab = computed({
    get: () => AntigravitySetup.skillViewTab,
    set: (value) => {
      AntigravitySetup.skillViewTab = value
    }
  })

  const title = computed(() => getAntigravitySkillTitle(props.skill))
  const canSave = ref(false)
  const content = ref('')
  const contentBackup = ref('')
  const html = ref('')
  const editorRef = ref<HTMLElement>()
  const mainRef = ref<HTMLElement>()
  const leftStyle = ref({ width: '50%', flex: 'unset' })
  let filePath = props.skill.path
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
      const exists = await fs.existsSync(filePath)
      if (!exists) {
        content.value = `# ${I18nT('antigravity.skillFileMissing')}`
        canSave.value = false
      } else {
        content.value = await fs.readFile(filePath)
        canSave.value = canEditAntigravitySkill(props.skill)
      }
    } catch {
      content.value = `# ${I18nT('antigravity.skillLoadFailed')}`
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
      await fs.writeFile(filePath, nextContent)
      content.value = nextContent
      contentBackup.value = nextContent
      MessageSuccess(I18nT('base.success'))
    } catch (error) {
      MessageError(`${error}`)
    }
  }

  defineExpose({ show, onSubmit, onClosed })
</script>
```

- [ ] **Step 2: Keep the drawer styles aligned with Hermes**

Add the same minimal scoped styles used by the Hermes drawer so split view resizing works:

```css
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

- [ ] **Step 3: Run targeted lint on the new drawer**

Run: `npx eslint src/render/components/Antigravity/SkillView.vue`

Expected: exit `0`

- [ ] **Step 4: Commit the drawer**

```bash
git add src/render/components/Antigravity/SkillView.vue src/render/components/Antigravity/setup.ts
git commit -m "feat: add antigravity skill preview drawer"
```

### Task 5: Upgrade the Skills Tab UI, Add Labels, and Verify End-to-End

**Files:**
- Modify: `src/render/components/Antigravity/Skills.vue`
- Modify: `src/lang/en/antigravity.json`
- Test: `scripts/antigravity-skills-workbench-test.ts`

- [ ] **Step 1: Replace the old copy-only row actions in `Skills.vue`**

Update the card header and row actions to call the new setup methods:

```vue
<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header gap-4">
        <div class="flex items-center gap-2">
          <span>{{ I18nT('antigravity.skills') }}</span>
          <el-tooltip :content="I18nT('antigravity.openSkillsDir')" placement="top">
            <el-button link @click="AntigravitySetup.openSkillsDir()">
              <FolderOpened class="w-[18px] h-[18px]" />
            </el-button>
          </el-tooltip>
        </div>
        <el-button
          link
          :disabled="AntigravitySetup.skillsLoading"
          @click="AntigravitySetup.refreshSkills()"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="w-[24px] h-[24px]"
            :class="{ 'fa-spin': AntigravitySetup.skillsLoading }"
          />
        </el-button>
      </div>
    </template>

    <div class="w-full h-full overflow-hidden">
      <div v-loading="AntigravitySetup.skillsLoading" class="p-5 h-full overflow-hidden flex flex-col">
        <el-scrollbar v-if="AntigravitySetup.skills.length > 0">
          <div v-for="item in AntigravitySetup.skills" :key="item.path" class="skill-row">
            <div class="skill-info">
              <div class="skill-title">
                <span class="name">{{ item.name }}</span>
                <el-tag v-if="item.builtin" size="small" type="info">
                  {{ I18nT('antigravity.builtin') }}
                </el-tag>
              </div>
              <div class="skill-desc">
                <el-tooltip :content="item.description || item.path" placement="top" :show-after="300">
                  <span>{{ item.description || item.path }}</span>
                </el-tooltip>
              </div>
            </div>

            <div class="skill-actions">
              <el-tooltip :content="I18nT('antigravity.openSkillDir')" placement="top">
                <el-button link @click="AntigravitySetup.openSkillDir(item)">
                  <yb-icon :svg="import('@/svg/folder.svg?raw')" width="18" height="18" />
                </el-button>
              </el-tooltip>
              <el-tooltip :content="I18nT('antigravity.revealSkillFile')" placement="top">
                <el-button link @click="AntigravitySetup.revealSkillFile(item)">
                  <yb-icon :svg="import('@/svg/fileinfo.svg?raw')" width="18" height="18" />
                </el-button>
              </el-tooltip>
              <el-tooltip :content="I18nT('base.info')" placement="top">
                <el-button link @click="AntigravitySetup.viewSkill(item)">
                  <yb-icon :svg="import('@/svg/eye.svg?raw')" width="18" height="18" />
                </el-button>
              </el-tooltip>
            </div>
          </div>
        </el-scrollbar>
        <el-empty
          v-else-if="!AntigravitySetup.skillsLoading"
          :description="I18nT('antigravity.noSkills')"
        />
      </div>
    </div>
  </el-card>
</template>
```

- [ ] **Step 2: Add the script imports and row title styling**

Use these imports and style adjustments in the same file:

```ts
<script lang="ts" setup>
  import { onMounted } from 'vue'
  import { FolderOpened } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import { AntigravitySetup } from './setup'

  onMounted(() => {
    AntigravitySetup.refreshSkills()
  })
</script>

<style lang="scss" scoped>
  .skill-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 8px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    gap: 16px;

    .skill-info {
      flex: 1;
      overflow: hidden;
    }

    .skill-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .name {
      font-weight: 500;
    }

    .skill-desc {
      margin-top: 4px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .skill-actions {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
  }
</style>
```

- [ ] **Step 3: Add the English labels**

Append these keys to `src/lang/en/antigravity.json`:

```json
{
  "skills": "Skills",
  "noSkills": "No skills found",
  "openSkillsDir": "Open skills directory",
  "openSkillDir": "Open skill directory",
  "revealSkillFile": "Reveal skill file",
  "builtin": "Built-in",
  "skillFileMissing": "Skill file not found",
  "skillLoadFailed": "Failed to load skill file"
}
```

- [ ] **Step 4: Run the regression test, lint, and typecheck**

Run: `npx tsx scripts/antigravity-skills-workbench-test.ts`

Expected: PASS with `antigravity-skills-workbench-test: ok`

Run: `npx eslint src/shared/antigravitySkills.ts src/fork/module/Antigravity/index.ts src/render/components/Antigravity/setup.ts src/render/components/Antigravity/Skills.vue src/render/components/Antigravity/SkillView.vue scripts/antigravity-skills-workbench-test.ts`

Expected: exit `0`

Run: `npx vue-tsc --noEmit`

Expected: exit `0`

- [ ] **Step 5: Manually verify the UI behavior**

Check these behaviors in the running app:

```text
1. Antigravity > Skills shows the header folder button.
2. Header folder button opens ~/.gemini/antigravity-cli/skills.
3. Each row can open its directory and reveal its file.
4. Info action opens the drawer with code/both/preview switching.
5. User skills save successfully with Cmd/Ctrl+S and the save button.
6. Built-in skills show the Built-in tag and do not allow saving.
```

- [ ] **Step 6: Commit the finished feature**

```bash
git add src/shared/antigravitySkills.ts \
  scripts/antigravity-skills-workbench-test.ts \
  src/fork/module/Antigravity/index.ts \
  src/render/components/Antigravity/setup.ts \
  src/render/components/Antigravity/Skills.vue \
  src/render/components/Antigravity/SkillView.vue \
  src/lang/en/antigravity.json \
  docs/superpowers/specs/2026-06-29-antigravity-skills-workbench-design.md \
  docs/superpowers/plans/2026-06-29-antigravity-skills-workbench-plan.md
git commit -m "feat: improve antigravity skill tooling"
```
