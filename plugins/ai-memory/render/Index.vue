<template>
  <div class="soft-index-panel main-right-panel memory-page">
    <el-radio-group v-model="tab" class="memory-navigation" @change="changeTab">
      <el-radio-button value="memories">{{ T('memories') }}</el-radio-button>
      <el-radio-button value="connect">{{ T('connectAgent') }}</el-radio-button>
      <el-radio-button value="maintenance">{{ T('maintenance') }}</el-radio-button>
      <el-radio-button value="calls">{{ T('calls') }}</el-radio-button>
    </el-radio-group>
    <div class="main-block">
      <MemoryCalls v-if="tab === 'calls'" />
      <MemoryConnect v-else-if="tab === 'connect'" />
      <MemorySetup v-else-if="tab === 'maintenance'" />
      <MemoryUniverse
        v-else
        :memories="manager.searchResult?.data?.results ?? []"
        :busy="manager.searchBusy"
        :scope-label="scopeLabel"
        :selected-hit="selectedHit"
        :detail-open="detailOpen"
        @select="select"
        @close-detail="closeDetail"
      >
        <template #toolbar>
          <div class="memory-toolbar" role="search">
            <el-select
              id="memory-scope"
              v-model="scopeKey"
              :aria-label="T('project')"
              @change="changeScope"
            >
              <el-option :label="T('global')" value="global" />
              <el-option
                v-if="unresolvedProject"
                :label="
                  T(
                    manager.projectsBusy ? 'projectSelectionLoading' : 'projectSelectionUnavailable'
                  )
                "
                :value="scopeKey"
                disabled
              />
              <el-option
                v-for="project in manager.projectsResult?.data ?? []"
                :key="project.projectId"
                :label="project.name"
                :title="project.project_path"
                :value="project.projectId"
                class="memory-project-option"
              >
                <strong>{{ project.name }}</strong>
                <small>{{ project.project_path }}</small>
              </el-option>
              <el-option :label="T('newProject')" value="path" />
            </el-select>
            <el-input
              id="memory-query"
              v-model="query"
              :placeholder="T('query')"
              clearable
              @clear="loadMemories()"
              @keyup.enter="loadMemories()"
            />
            <el-button
              id="memory-search"
              class="memory-icon-button"
              :icon="Search"
              :aria-label="T('search')"
              :title="T('search')"
              :loading="manager.searchBusy"
              @click="loadMemories()"
            />
            <el-button
              id="memory-refresh"
              class="memory-icon-button"
              :icon="Refresh"
              :aria-label="T('refresh')"
              :title="T('refresh')"
              :loading="manager.searchBusy || manager.projectsBusy"
              @click="refresh"
            />
            <el-button
              id="memory-new"
              class="memory-icon-button"
              type="primary"
              :icon="Plus"
              :aria-label="T('newMemory')"
              :title="T('newMemory')"
              :disabled="!validTarget || writeBlocked"
              @click="create"
            />
          </div>
        </template>
        <template #heading-after>
          <div v-if="scopeProjectPath" class="memory-project-actions">
            <button
              type="button"
              class="memory-project-action"
              :aria-label="T('openFolder')"
              :title="`${T('openFolder')} · ${scopeProjectPath}`"
              :disabled="manager.actions[`project:open:${scopeProjectPath}`]?.status === 'running'"
              @click="manager.openProjectDirectory(scopeProjectPath)"
            >
              <FolderOpened aria-hidden="true" />
            </button>
            <button
              type="button"
              class="memory-project-action"
              :aria-label="T('openTerminal')"
              :title="`${T('openTerminal')} · ${scopeProjectPath}`"
              :disabled="
                manager.actions[`project:terminal:${scopeProjectPath}`]?.status === 'running'
              "
              @click="manager.openProjectTerminal(scopeProjectPath)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="m7 9 3 3-3 3m6 0h4" />
              </svg>
            </button>
          </div>
        </template>
        <template #notices>
          <div v-if="scopeKey === 'path'" class="memory-project-picker">
            <el-input
              id="memory-project-path"
              v-model="projectPath"
              :placeholder="T('projectPath')"
              @keyup.enter="changeScope"
            />
            <el-button
              :loading="manager.actions['project:choose']?.status === 'running'"
              @click="chooseProject"
              >{{ T('chooseDirectory') }}</el-button
            >
            <el-button :disabled="!validTarget" @click="changeScope">{{
              T('openProject')
            }}</el-button>
            <el-alert
              v-if="
                manager.actions['project:choose']?.result?.success === false &&
                !manager.actions['project:choose']?.result?.cancelled
              "
              :title="T('directory_unavailable')"
              type="error"
              :closable="false"
            />
          </div>
          <el-alert
            v-if="manager.projectsResult?.error_code"
            :title="T(manager.projectsResult.error_code)"
            type="error"
            :closable="false"
          />
          <el-alert
            v-if="selectedProject && selectedProject.path_status !== 'available'"
            :title="T('missing')"
            type="warning"
            :closable="false"
          />
          <el-alert
            v-if="manager.searchResult?.error_code"
            :title="T(manager.searchResult.error_code)"
            type="error"
            :closable="false"
          />
          <div v-if="manager.searchResult?.data?.unregistered" class="memory-project-notice">
            <p>{{ T('unregistered') }}</p>
            <el-button
              v-for="candidate in manager.searchResult.data.project_candidates ?? []"
              :key="candidate.project_path"
              @click="chooseCandidate(candidate.project_path)"
              >{{ candidate.name }} · {{ candidate.project_path }}</el-button
            >
            <el-checkbox
              v-if="manager.searchResult.data.project_candidates?.length"
              v-model="independent"
              >{{ T('independent') }}</el-checkbox
            >
          </div>
          <el-alert
            v-if="manager.searchResult?.warnings?.length"
            :title="T('searchPartial')"
            type="warning"
            :closable="false"
            ><p v-for="(warning, index) in manager.searchResult.warnings" :key="index">{{
              T(warning.code)
            }}</p></el-alert
          >
          <MemoryOperation v-if="!editorOpen && !archiveOpen" global @resolved="refresh" />
        </template>
        <template #empty>
          <p>{{ T(manager.searchResult?.error_code ? 'loadFailed' : 'empty') }}</p>
          <p>{{ T('emptyHelp') }}</p>
          <el-button size="small" @click="openConnection">{{ T('connectAgent') }}</el-button>
        </template>
        <template #detail="{ relatedCount }">
          <div v-loading="manager.detailBusy" class="memory-detail">
            <el-alert
              v-if="manager.detail?.error_code"
              :title="T(manager.detail.error_code)"
              type="error"
              :closable="false"
            />
            <template v-if="manager.detail?.data">
              <span class="detail-type">{{ T(manager.detail.data.type) }}</span>
              <h3>{{ manager.detail.data.title }}</h3>
              <p class="memory-detail-summary">{{ manager.detail.data.summary }}</p>
              <div class="detail-metrics">
                <span>{{ T('relatedMemories') }}</span
                ><strong>{{ relatedCount }}</strong>
                <small>{{ T('semanticHelp') }}</small>
              </div>
              <div class="detail-tags"
                ><span v-for="tag in manager.detail.data.tags" :key="tag">{{ tag }}</span></div
              >
              <div class="memory-detail-actions">
                <button
                  id="memory-edit"
                  type="button"
                  class="memory-detail-action"
                  :disabled="writeBlocked"
                  @click="edit"
                  ><EditPen aria-hidden="true" />{{ T('edit') }}</button
                >
                <button
                  type="button"
                  class="memory-detail-action"
                  :disabled="writeBlocked"
                  @click="openArchive"
                  ><component
                    :is="manager.detail.data.status === 'active' ? Box : RefreshLeft"
                    aria-hidden="true"
                  />{{
                    T(manager.detail.data.status === 'active' ? 'archiveAction' : 'restoreAction')
                  }}</button
                >
                <el-popconfirm
                  :title="T('deleteWarning')"
                  :confirm-button-text="T('forget')"
                  :cancel-button-text="T('cancel')"
                  :width="320"
                  @confirm="forget"
                >
                  <template #reference
                    ><button
                      id="memory-delete"
                      type="button"
                      class="memory-detail-action memory-detail-action-danger"
                      :disabled="writeBlocked"
                      ><Delete aria-hidden="true" />{{ T('forget') }}</button
                    ></template
                  >
                </el-popconfirm>
              </div>
              <MemoryOperation
                v-if="!editorOpen && !archiveOpen"
                :request-id="detailOperationId"
                @resolved="refresh"
              />
              <!-- eslint-disable vue/no-v-html -->
              <div
                class="memory-markdown"
                v-html="renderMemoryMarkdown(manager.detail.data.content)"
              />
              <!-- eslint-enable vue/no-v-html -->
              <el-descriptions :column="1" class="mt-5">
                <el-descriptions-item :label="T('source')"
                  >{{ T(manager.detail.data.source.kind) }} · {{ manager.detail.data.source.agent
                  }}<p>{{ manager.detail.data.source.description }}</p></el-descriptions-item
                >
                <el-descriptions-item :label="T('updated')">{{
                  displayDate(manager.detail.data.updated_at)
                }}</el-descriptions-item>
              </el-descriptions>
              <details class="memory-technical"
                ><summary>{{ T('technicalDetails') }}</summary>
                <el-descriptions :column="1"
                  ><el-descriptions-item :label="T('id')">{{
                    manager.detail.data.id
                  }}</el-descriptions-item
                  ><el-descriptions-item :label="T('revision')">{{
                    manager.detail.data.revision
                  }}</el-descriptions-item
                  ><el-descriptions-item :label="T('reason')">{{
                    manager.detail.data.change_reason
                  }}</el-descriptions-item
                  ><el-descriptions-item :label="T('sourceUri')">{{
                    manager.detail.data.source.uri || '—'
                  }}</el-descriptions-item></el-descriptions
                >
              </details>
            </template>
          </div>
        </template>
      </MemoryUniverse>
    </div>
    <MemoryEditor
      v-model="editorOpen"
      :target="editorTarget"
      :current="editing"
      :independent="independent"
      @saved="saved"
    />
    <el-dialog v-model="archiveOpen" :title="T('archive')" width="min(480px, 94vw)">
      <el-form label-position="top"
        ><el-form-item :label="T('reason')" required :error="archiveError"
          ><el-input
            id="memory-archive-reason"
            v-model="archiveReason"
            maxlength="600" /></el-form-item
      ></el-form>
      <MemoryOperation :request-id="archiveOperationId" @resolved="archiveResolved" />
      <template #footer
        ><el-button @click="archiveOpen = false">{{ T('cancel') }}</el-button
        ><el-button
          id="memory-archive-save"
          :loading="manager.mutation?.status === 'running'"
          :disabled="manager.mutation?.result?.outcome === 'unknown'"
          type="primary"
          @click="archive"
          >{{ T('save') }}</el-button
        ></template
      >
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue'
  import {
    Search,
    Plus,
    FolderOpened,
    EditPen,
    Box,
    RefreshLeft,
    Refresh,
    Delete
  } from '@element-plus/icons-vue'
  import { type MemoryView, type SearchHit } from '../shared'
  import { AppModuleTab } from '@/core/Module'
  import { memoryNavigationTab } from './navigation'
  import { MemoryManager as manager } from './manager'
  import type { MemoryTarget } from './controller'
  import { MemoryT as T } from './lang'
  import { renderMemoryMarkdown } from './markdown'
  import MemoryEditor from './MemoryEditor.vue'
  import MemorySetup from './MemorySetup.vue'
  import MemoryConnect from './MemoryConnect.vue'
  import MemoryOperation from './MemoryOperation.vue'
  import MemoryUniverse from './MemoryUniverse.vue'
  import MemoryCalls from './MemoryCalls.vue'
  import { displayDate, memoryProjectSelection } from './presentation'
  const tab = memoryNavigationTab(AppModuleTab)
  const detailOpen = ref(false)
  const selectedHit = ref<SearchHit>()
  const scopeKey = ref('global'),
    projectPath = ref(''),
    query = ref('')
  watch(
    () => manager.relinkedProject,
    (project) => {
      if (!project) return
      if (
        scopeKey.value === 'path' &&
        (projectPath.value.trim() === project.previousPath ||
          projectPath.value.trim() === project.selectedPath)
      ) {
        scopeKey.value = project.projectId
        projectPath.value = ''
      }
      if (project.mergedProjectIds?.includes(scopeKey.value)) scopeKey.value = project.projectId
      if (tab.value === 'memories') refresh()
    }
  )
  watch(
    () => manager.projectsResult,
    (result, previous) => {
      if (scopeKey.value === 'global' || scopeKey.value === 'path') return
      const id = memoryProjectSelection(result, scopeKey.value)
      const nowAvailable = result?.data?.some((project) => project.projectId === id)
      const wasAvailable = previous?.data?.some((project) => project.projectId === scopeKey.value)
      if (id !== scopeKey.value) {
        scopeKey.value = id
        if (tab.value === 'memories') refreshMemories()
        else closeDetail()
      } else if (
        result?.outcome === 'success' &&
        nowAvailable &&
        !wasAvailable &&
        tab.value === 'memories'
      )
        refreshMemories()
    }
  )
  const independent = ref(false)
  const editorOpen = ref(false),
    archiveOpen = ref(false),
    archiveReason = ref(''),
    archiveError = ref('')
  const editing = ref<MemoryView>(),
    editorTarget = ref<MemoryTarget>({ scope: 'global' }),
    detailTarget = ref<MemoryTarget>({ scope: 'global' })
  const detailOperationId = ref<string>(),
    archiveOperationId = ref<string>()
  const selectedProject = computed(() =>
    manager.projectsResult?.data?.find((p) => p.projectId === scopeKey.value)
  )
  const unresolvedProject = computed(
    () => scopeKey.value !== 'global' && scopeKey.value !== 'path' && !selectedProject.value
  )
  const validTarget = computed(() =>
    scopeKey.value === 'path' ? !!projectPath.value.trim() : !unresolvedProject.value
  )
  const writeBlocked = computed(
    () => manager.mutation?.status === 'running' || manager.mutation?.result?.outcome === 'unknown'
  )
  const target = computed<MemoryTarget>(() =>
    scopeKey.value === 'global'
      ? { scope: 'global' }
      : scopeKey.value === 'path'
        ? { scope: 'project', project_path: projectPath.value.trim() }
        : { projectId: scopeKey.value }
  )
  const scopeProjectPath = computed(() =>
    scopeKey.value === 'global'
      ? ''
      : scopeKey.value === 'path'
        ? projectPath.value.trim()
        : selectedProject.value?.project_path || ''
  )
  const scopeLabel = computed(() =>
    scopeKey.value === 'global' ? T('global') : selectedProject.value?.name || T('project')
  )
  function closeDetail() {
    detailOpen.value = false
    selectedHit.value = undefined
    manager.clearDetail()
  }
  function refreshMemories(fresh = false) {
    closeDetail()
    if (!validTarget.value) {
      manager.clearSearch()
      return
    }
    void manager.search(
      { ...target.value },
      { queries: query.value.trim() ? [query.value.trim()] : [] },
      true,
      fresh
    )
  }
  async function loadMemories(fresh = false) {
    await manager.loadProjects(fresh)
    refreshMemories(fresh)
  }
  function refresh() {
    void loadMemories(true)
  }
  function changeScope() {
    independent.value = false
    closeDetail()
    if (!validTarget.value) {
      manager.clearSearch()
      return
    }
    void manager.savePreference(target.value)
    void loadMemories()
  }
  async function chooseProject() {
    const path = await manager.chooseProject()
    if (path) {
      projectPath.value = path
      changeScope()
    }
  }
  function chooseCandidate(path: string) {
    scopeKey.value = 'path'
    projectPath.value = path
    changeScope()
  }
  function select(hit: SearchHit) {
    selectedHit.value = hit
    detailOperationId.value = undefined
    detailTarget.value =
      hit.scope === 'global' ? { scope: 'global' } : { projectId: hit.projectId! }
    detailOpen.value = true
    void manager.get(detailTarget.value, hit.id)
  }
  function create() {
    editing.value = undefined
    editorTarget.value = { ...target.value }
    editorOpen.value = true
  }
  function edit() {
    editing.value = manager.detail?.data
    editorTarget.value = { ...detailTarget.value }
    editorOpen.value = true
  }
  function saved() {
    detailOpen.value = false
    refresh()
  }
  function openArchive() {
    archiveOperationId.value = undefined
    archiveReason.value = ''
    archiveError.value = ''
    archiveOpen.value = true
  }
  function archiveResolved() {
    archiveOpen.value = false
    refresh()
  }
  async function archive() {
    if (!archiveReason.value.trim()) {
      archiveError.value = T('required')
      return
    }
    if (!manager.detail?.data) return
    const flight = manager.archive(detailTarget.value, manager.detail.data, archiveReason.value)
    archiveOperationId.value = manager.mutation?.input.request_id
    const result = await flight
    if (result.outcome === 'success') archiveResolved()
  }
  async function forget() {
    if (!manager.detail?.data) return
    const flight = manager.forget(detailTarget.value, manager.detail.data)
    detailOperationId.value = manager.mutation?.input.request_id
    const result = await flight
    if (['success', 'already_deleted', 'partial'].includes(result.outcome)) {
      detailOpen.value = false
      refresh()
    }
  }
  function openConnection() {
    tab.value = 'connect'
    changeTab()
  }
  function changeTab() {
    closeDetail()
    if (tab.value === 'memories') void loadMemories()
  }
  onMounted(async () => {
    manager.clearDetail()
    await manager.initialize()
    const value = manager.preferredTarget
    if ('projectId' in value) scopeKey.value = value.projectId
    else if (value.scope === 'project') {
      scopeKey.value = 'path'
      projectPath.value = value.project_path
    }
    if (tab.value === 'memories') void loadMemories()
  })
</script>
<style scoped>
  .memory-navigation {
    margin-top: 12px;
    flex-shrink: 0;
  }
  .memory-page > .main-block {
    overflow: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .memory-toolbar {
    display: grid;
    grid-template-columns: 210px minmax(120px, 1fr) repeat(3, 36px);
    gap: 10px;
    align-items: center;
  }
  .memory-toolbar .el-button {
    margin: 0;
  }
  .memory-project-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .memory-project-picker > .el-input {
    flex: 1;
    min-width: 180px;
  }
  .memory-project-option {
    height: auto;
    line-height: 1.5;
    padding-top: 6px;
    padding-bottom: 6px;
  }
  .memory-project-option strong,
  .memory-project-option small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .memory-project-option small {
    color: var(--el-text-color-secondary);
  }
  .memory-icon-button {
    width: 36px;
    height: 32px;
    padding: 0;
  }
  .memory-project-actions {
    display: flex;
    flex-shrink: 0;
    gap: 4px;
    margin-left: 10px;
  }
  .memory-project-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 5px;
    color: #898877;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    cursor: pointer;
  }
  .memory-project-action:hover,
  .memory-project-action:focus-visible {
    color: #eab308;
    background: #eab3080c;
    border-color: #eab30830;
  }
  .memory-project-action svg {
    width: 17px;
    height: 17px;
  }
  .memory-project-action:disabled {
    opacity: 0.4;
    cursor: wait;
  }
  .memory-project-notice {
    line-height: 1.8;
  }
  .memory-detail-summary {
    color: #a29f93;
    line-height: 1.8;
    margin-top: 12px;
  }
  .detail-type {
    color: var(--active-color, #ceb780);
    font-size: 10px;
  }
  .detail-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 12px;
  }
  .detail-tags span {
    padding: 4px 7px;
    font-size: 10px;
    border: 1px solid color-mix(in srgb, var(--active-color, #c9ad72) 15%, transparent);
    background: color-mix(in srgb, var(--active-color, #c9ad72) 4%, transparent);
    border-radius: 3px;
    color: #9d9c8e;
  }
  .detail-metrics {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
    border-block: 1px solid #bda36b20;
    padding: 16px 0;
    margin-top: 18px;
  }
  .detail-metrics span {
    color: #818b73;
    font-size: 10px;
  }
  .detail-metrics strong {
    grid-row: 1 / 3;
    grid-column: 2;
    font:
      23px ui-monospace,
      monospace;
    color: var(--active-color, #c9ad72);
  }
  .detail-metrics small {
    color: #818b73;
    font-size: 9px;
  }
  .memory-detail-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 30px;
    padding: 6px 9px;
    color: #b4b09e;
    font: inherit;
    font-size: 11px;
    line-height: 1.4;
    background: transparent;
    border: 1px solid #b7bca626;
    border-radius: 5px;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s,
      background 0.15s;
  }
  .memory-detail-action svg {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
  }
  .memory-detail-action:hover,
  .memory-detail-action:focus-visible {
    color: var(--active-color, #c9ad72);
    border-color: color-mix(in srgb, var(--active-color, #c9ad72) 40%, transparent);
    background: color-mix(in srgb, var(--active-color, #c9ad72) 7%, transparent);
  }
  .memory-detail-action-danger {
    color: #b88d8a;
    border-color: #b88d8a30;
  }
  .memory-detail-action-danger:hover,
  .memory-detail-action-danger:focus-visible {
    color: #f09a94;
    border-color: #f09a9455;
    background: #f09a940c;
  }
  .memory-detail-action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  @container memory-universe (max-width: 640px) {
    .memory-toolbar {
      grid-template-columns: minmax(0, 1fr) 36px 36px;
      gap: 8px;
    }
    .memory-toolbar > .el-input {
      grid-column: 1 / 3;
      grid-row: 2;
    }
    #memory-search {
      grid-column: 3;
      grid-row: 2;
    }
    #memory-refresh {
      grid-column: 2;
      grid-row: 1;
    }
    #memory-new {
      grid-column: 3;
      grid-row: 1;
    }
  }
  .memory-detail {
    min-height: 120px;
  }
  .memory-detail h3 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 10px;
    overflow-wrap: anywhere;
  }
  .memory-detail-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 16px 0;
  }
  .memory-technical {
    margin-top: 20px;
    border-top: 1px solid #bda36b20;
    padding-top: 16px;
    overflow-wrap: anywhere;
  }
  summary {
    cursor: pointer;
    color: #9d9c8e;
  }
  .memory-markdown {
    line-height: 1.8;
    overflow-wrap: anywhere;
    margin-top: 20px;
  }
  .memory-markdown :deep(pre) {
    overflow: auto;
    padding: 12px;
    background: #b7bca60a;
  }
  .memory-markdown :deep(p) {
    margin: 10px 0;
  }
  .memory-markdown :deep(h1),
  .memory-markdown :deep(h2),
  .memory-markdown :deep(h3) {
    font-weight: 600;
    margin: 14px 0;
  }
</style>
