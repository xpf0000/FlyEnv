<template>
  <div class="soft-index-panel main-right-panel memory-page">
    <el-radio-group v-model="tab" class="mt-3" @change="changeTab">
      <el-radio-button value="memories">{{ T('memories') }}</el-radio-button>
      <el-radio-button value="connect">{{ T('connectAgent') }}</el-radio-button>
      <el-radio-button value="maintenance">{{ T('maintenance') }}</el-radio-button>
    </el-radio-group>
    <div class="main-block">
      <MemorySetup v-if="tab !== 'memories'" :section="tab" />
      <div v-else class="memory-manager">
        <div class="memory-toolbar">
          <el-select
            id="memory-scope"
            v-model="scopeKey"
            :aria-label="T('project')"
            @change="changeScope"
          >
            <el-option :label="T('global')" value="global" />
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
            @clear="refresh"
            @keyup.enter="refresh"
          />
          <el-button id="memory-search" :loading="manager.searchBusy" @click="refresh">{{
            T('search')
          }}</el-button>
          <el-button :aria-expanded="advanced" @click="advanced = !advanced">{{
            T('filters')
          }}</el-button>
          <el-button
            id="memory-new"
            type="primary"
            :disabled="!validTarget || writeBlocked"
            @click="create"
            >{{ T('newMemory') }}</el-button
          >
        </div>
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
        <p v-if="selectedProject" class="memory-project-path">{{ selectedProject.project_path }}</p>
        <el-form
          v-if="advanced"
          class="memory-filters"
          label-position="top"
          @submit.prevent="refresh"
        >
          <el-form-item :label="T('type')"
            ><el-select v-model="type" clearable :placeholder="T('allTypes')"
              ><el-option
                v-for="value in MEMORY_TYPES"
                :key="value"
                :value="value"
                :label="T(value)" /></el-select
          ></el-form-item>
          <el-form-item :label="T('status')"
            ><el-select v-model="status"
              ><el-option :label="T('active')" value="active" /><el-option
                :label="T('archived')"
                value="archived" /></el-select
          ></el-form-item>
          <el-form-item :label="T('topic')"><el-input v-model="topic" clearable /></el-form-item>
          <el-form-item :label="T('tags')"><el-input v-model="tags" clearable /></el-form-item>
          <el-checkbox v-if="scopeKey !== 'global'" v-model="includeGlobal">{{
            T('includeGlobal')
          }}</el-checkbox>
          <el-checkbox v-model="includeExpired">{{ T('includeExpired') }}</el-checkbox>
        </el-form>
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
        <div v-loading="manager.searchBusy" class="memory-table-wrap">
          <el-table
            :data="manager.searchResult?.data?.results ?? []"
            row-key="id"
            class="memory-table"
            @row-click="select"
          >
            <el-table-column :label="T('memoryTitle')" min-width="240"
              ><template #default="{ row }"
                ><div class="memory-row"
                  ><strong>{{ row.title }}</strong
                  ><span>{{ row.summary }}</span></div
                ></template
              ></el-table-column
            >
            <el-table-column :label="T('type')" width="130"
              ><template #default="{ row }">{{ T(row.type) }}</template></el-table-column
            >
            <el-table-column :label="T('tagList')" min-width="150"
              ><template #default="{ row }"
                ><el-tag v-for="tag in row.tags" :key="tag" size="small" class="mr-1">{{
                  tag
                }}</el-tag></template
              ></el-table-column
            >
            <el-table-column :label="T('updated')" width="170"
              ><template #default="{ row }">{{
                displayDate(row.updated_at)
              }}</template></el-table-column
            >
            <el-table-column width="80"
              ><template #default="{ row }"
                ><el-button link type="primary" @click.stop="select(row)">{{
                  T('view')
                }}</el-button></template
              ></el-table-column
            >
            <template #empty>
              <el-empty :description="T(manager.searchResult?.error_code ? 'loadFailed' : 'empty')">
                <p class="memory-empty-help">{{ T('emptyHelp') }}</p>
                <el-button type="primary" @click="tab = 'connect'">{{
                  T('connectAgent')
                }}</el-button>
                <el-button :disabled="!validTarget || writeBlocked" @click="create">{{
                  T('newMemory')
                }}</el-button>
              </el-empty>
            </template>
          </el-table>
        </div>
        <div
          v-if="cursors.length || manager.searchResult?.data?.next_cursor"
          class="memory-pagination"
        >
          <el-button
            id="memory-prev"
            :disabled="!cursors.length || manager.searchBusy"
            @click="previousPage"
            >{{ T('previous') }}</el-button
          >
          <span>{{ T('page') }} {{ cursors.length + 1 }}</span>
          <el-button
            id="memory-next"
            :disabled="!manager.searchResult?.data?.next_cursor || manager.searchBusy"
            @click="nextPage"
            >{{ T('next') }}</el-button
          >
        </div>
      </div>
    </div>
    <el-drawer
      v-model="detailOpen"
      destroy-on-close
      :title="T('memoryDetail')"
      size="min(680px, 94vw)"
      @closed="!detailOpen && manager.clearDetail()"
    >
      <div v-loading="manager.detailBusy" class="memory-detail">
        <el-alert
          v-if="manager.detail?.error_code"
          :title="T(manager.detail.error_code)"
          type="error"
          :closable="false"
        />
        <template v-if="manager.detail?.data">
          <h3>{{ manager.detail.data.title }}</h3
          ><el-tag size="small">{{
            T('scope' in detailTarget && detailTarget.scope === 'global' ? 'global' : 'project')
          }}</el-tag>
          <p class="memory-detail-summary">{{ manager.detail.data.summary }}</p>
          <div class="memory-detail-actions">
            <el-button id="memory-edit" type="primary" :disabled="writeBlocked" @click="edit">{{
              T('edit')
            }}</el-button>
            <el-button :disabled="writeBlocked" @click="openArchive">{{
              T(manager.detail.data.status === 'active' ? 'archiveAction' : 'restoreAction')
            }}</el-button>
            <el-popconfirm
              :title="T('deleteWarning')"
              :confirm-button-text="T('forget')"
              :cancel-button-text="T('cancel')"
              :width="320"
              @confirm="forget"
              ><template #reference
                ><el-button id="memory-delete" type="danger" plain :disabled="writeBlocked">{{
                  T('forget')
                }}</el-button></template
              ></el-popconfirm
            >
          </div>
          <MemoryOperation
            v-if="!editorOpen && !archiveOpen"
            :request-id="detailOperationId"
            @resolved="refresh"
          />
          <!-- eslint-disable vue/no-v-html -->
          <div class="memory-markdown" v-html="renderMemoryMarkdown(manager.detail.data.content)" />
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
    </el-drawer>
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
  import { computed, onMounted, ref } from 'vue'
  import { MEMORY_TYPES, type MemoryType, type MemoryView, type SearchHit } from '../shared'
  import { MemoryManager as manager } from './manager'
  import type { MemoryTarget } from './controller'
  import { MemoryT as T } from './lang'
  import { renderMemoryMarkdown } from './markdown'
  import MemoryEditor from './MemoryEditor.vue'
  import MemorySetup from './MemorySetup.vue'
  import MemoryOperation from './MemoryOperation.vue'
  import { displayDate } from './presentation'
  const tab = ref<'memories' | 'connect' | 'maintenance'>('memories')
  const advanced = ref(false),
    detailOpen = ref(false)
  const scopeKey = ref('global'),
    projectPath = ref(''),
    query = ref(''),
    topic = ref(''),
    tags = ref('')
  const type = ref<MemoryType | ''>(''),
    status = ref<'active' | 'archived'>('active')
  const includeGlobal = ref(false),
    includeExpired = ref(false),
    independent = ref(false)
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
  const validTarget = computed(() => scopeKey.value !== 'path' || !!projectPath.value.trim())
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
  const filters = () => ({
    queries: query.value.trim() ? [query.value.trim()] : [],
    ...(topic.value ? { topic: topic.value } : {}),
    ...(tags.value
      ? {
          tags: tags.value
            .split(/[,，]/)
            .map((t) => t.trim())
            .filter(Boolean)
        }
      : {}),
    ...(type.value ? { type: type.value } : {}),
    status: status.value,
    include_expired: includeExpired.value,
    ...(scopeKey.value !== 'global' ? { include_global: includeGlobal.value } : {})
  })
  const cursors = ref<(string | undefined)[]>([])
  let currentCursor: string | undefined
  let lastSearch: { target: MemoryTarget; filters: ReturnType<typeof filters> } | undefined
  function refresh() {
    if (!validTarget.value) return
    detailOpen.value = false
    manager.clearDetail()
    cursors.value = []
    currentCursor = undefined
    lastSearch = { target: { ...target.value }, filters: filters() }
    void manager.search(lastSearch.target, lastSearch.filters)
    void manager.loadProjects()
  }
  function nextPage() {
    const next = manager.searchResult?.data?.next_cursor
    if (!lastSearch || !next || manager.searchBusy) return
    cursors.value.push(currentCursor)
    currentCursor = next
    void manager.search(lastSearch.target, { ...lastSearch.filters, cursor: next })
  }
  function previousPage() {
    if (!lastSearch || !cursors.value.length || manager.searchBusy) return
    currentCursor = cursors.value.pop()
    void manager.search(lastSearch.target, {
      ...lastSearch.filters,
      ...(currentCursor ? { cursor: currentCursor } : {})
    })
  }
  function changeScope() {
    independent.value = false
    detailOpen.value = false
    manager.clearDetail()
    if (!validTarget.value) {
      cursors.value = []
      currentCursor = undefined
      lastSearch = undefined
      manager.clearSearch()
      return
    }
    void manager.savePreference(target.value)
    refresh()
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
  function changeTab() {
    detailOpen.value = false
    manager.clearDetail()
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
    refresh()
  })
</script>
<style scoped>
  .memory-manager {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
    overflow: auto;
  }
  .memory-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .memory-toolbar > .el-select {
    width: 220px;
  }
  .memory-toolbar > .el-input {
    flex: 1;
    min-width: 180px;
  }
  .memory-project-picker {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .memory-project-picker > .el-input {
    flex: 1;
    min-width: 260px;
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
  .memory-project-path,
  .memory-empty-help,
  .memory-detail-summary {
    color: var(--el-text-color-secondary);
    overflow-wrap: anywhere;
  }
  .memory-empty-help {
    max-width: 460px;
    margin: 0 0 20px;
    line-height: 1.7;
  }
  .memory-filters {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0 16px;
    padding: 16px;
    background: var(--el-fill-color-light);
    border-radius: 6px;
  }
  .memory-project-notice {
    line-height: 1.8;
  }
  .memory-table-wrap {
    min-height: 220px;
    flex: 1;
  }
  .memory-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 5px 0;
    cursor: pointer;
  }
  .memory-row span {
    color: var(--el-text-color-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .memory-pagination {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 14px;
  }
  .memory-detail {
    padding: 0 20px 24px;
  }
  .memory-detail h3 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 10px;
    overflow-wrap: anywhere;
  }
  .memory-detail-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin: 22px 0;
  }
  .memory-technical {
    margin-top: 20px;
    border-top: 1px solid var(--el-border-color-light);
    padding-top: 16px;
    overflow-wrap: anywhere;
  }
  summary {
    cursor: pointer;
    color: var(--el-text-color-secondary);
  }
  .memory-markdown {
    line-height: 1.8;
    overflow-wrap: anywhere;
    margin-top: 20px;
  }
  .memory-markdown :deep(pre) {
    overflow: auto;
    padding: 12px;
    background: var(--el-fill-color-light);
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
  @media (max-width: 900px) {
    .memory-filters {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
