<template>
  <el-scrollbar class="h-full">
    <main class="memory-page p-6">
      <header class="flex justify-between items-start gap-4 mb-5"
        ><div
          ><h2>{{ T('title') }}</h2
          ><p>{{ T('subtitle') }}</p
          ><small>{{ T('preview') }}</small></div
        ><el-button id="memory-new" type="primary" @click="create">{{
          T('newMemory')
        }}</el-button></header
      >
      <el-form class="filters" @submit.prevent="refresh()">
        <el-select id="memory-scope" v-model="scopeKey" @change="changeScope">
          <el-option :label="T('global')" value="global" />
          <el-option
            v-for="project in manager.projectsResult?.data ?? []"
            :key="project.projectId"
            :label="`${project.name} — ${project.project_path}${project.path_status !== 'available' ? ' ⚠' : ''}`"
            :value="project.projectId"
          />
          <el-option :label="T('newProject')" value="path" />
        </el-select>
        <el-input
          v-if="scopeKey === 'path'"
          id="memory-project-path"
          v-model="projectPath"
          :placeholder="T('projectPath')"
        />
        <el-input
          id="memory-query"
          v-model="query"
          :placeholder="T('query')"
          clearable
          @keyup.enter="refresh()"
        />
        <el-input v-model="topic" :placeholder="T('topic')" clearable />
        <el-input v-model="tags" :placeholder="T('tags')" clearable />
        <el-select v-model="type" clearable :placeholder="T('allTypes')"
          ><el-option v-for="value in MEMORY_TYPES" :key="value" :value="value" :label="value"
        /></el-select>
        <el-select v-model="status"
          ><el-option :label="T('active')" value="active" /><el-option
            :label="T('archived')"
            value="archived"
        /></el-select>
        <el-button id="memory-search" :loading="manager.searchBusy" @click="refresh()">{{
          T('search')
        }}</el-button>
        <el-checkbox v-if="scopeKey !== 'global'" v-model="includeGlobal">{{
          T('includeGlobal')
        }}</el-checkbox>
        <el-checkbox v-model="includeExpired">{{ T('includeExpired') }}</el-checkbox>
        <el-checkbox v-if="scopeKey === 'path'" v-model="independent">{{
          T('independent')
        }}</el-checkbox>
      </el-form>
      <el-alert
        v-if="manager.projectsResult?.error_code"
        :title="T(manager.projectsResult.error_code)"
        type="error"
        :closable="false"
      />
      <p v-if="selectedProject?.path_status !== 'available' && selectedProject">{{
        T('missing')
      }}</p>
      <el-alert
        v-if="manager.searchResult?.error_code"
        :title="T(manager.searchResult.error_code)"
        type="error"
        :closable="false"
      />
      <p v-if="manager.searchResult?.data?.unregistered">{{ T('unregistered') }}</p>
      <div v-if="manager.searchResult?.data?.project_candidates?.length" class="my-3"
        ><p>{{ T('candidates') }}</p
        ><el-button
          v-for="candidate in manager.searchResult.data.project_candidates"
          :key="candidate.project_path"
          @click="chooseCandidate(candidate.project_path)"
          >{{ candidate.project_path }}</el-button
        ></div
      >
      <ul v-if="manager.searchResult?.warnings?.length" class="my-2 text-sm"
        ><li v-for="(warning, index) in manager.searchResult.warnings" :key="index"
          >{{ T(warning.code) }} {{ warning.id }}</li
        ></ul
      >
      <div v-if="manager.mutation" id="memory-operation" class="operation my-4 p-3" role="status">
        <strong>{{
          manager.mutation.status === 'running'
            ? T('running')
            : T(manager.mutation.result?.outcome ?? '')
        }}</strong>
        <p v-if="manager.mutation.result?.error_code">{{
          T(manager.mutation.result.error_code)
        }}</p>
        <p v-if="manager.mutation.result?.data?.id"
          >{{ manager.mutation.result.data.id }} · {{ T('revision') }}
          {{ manager.mutation.result.data.revision }}</p
        >
        <p v-for="(warning, index) in manager.mutation.result?.warnings ?? []" :key="index">{{
          T(warning.code)
        }}</p>
        <el-button
          v-if="['unknown', 'partial', 'failed'].includes(manager.mutation.result?.outcome ?? '')"
          :loading="manager.mutation.status === 'running'"
          @click="manager.retryMutation()"
          >{{ T('retry') }}</el-button
        >
      </div>
      <div class="memory-workspace">
        <section>
          <p v-if="manager.searchResult?.data?.results.length === 0">{{ T('empty') }}</p>
          <button
            v-for="hit in manager.searchResult?.data?.results ?? []"
            :key="`${hit.scope}:${hit.id}`"
            class="memory-row"
            :class="{ selected: manager.detail?.data?.id === hit.id }"
            @click="select(hit)"
          >
            <span class="flex justify-between gap-2"
              ><strong>{{ hit.pinned ? '★ ' : '' }}{{ hit.title }}</strong
              ><small>{{ T(hit.scope) }}</small></span
            >
            <span>{{ hit.summary }}</span
            ><small v-if="hit.metadata_omitted?.length">{{ T('metadataAbbreviated') }}</small
            ><small>{{ hit.type }} · {{ hit.topic }} · r{{ hit.revision }}</small
            ><small>{{ hit.tags.join(' · ') }}</small>
          </button>
          <el-button
            v-if="manager.searchResult?.data?.next_cursor"
            id="memory-next"
            class="mt-3"
            :loading="manager.searchBusy"
            @click="nextPage"
            >{{ T('next') }}</el-button
          >
        </section>
        <section class="memory-detail">
          <p v-if="manager.detailBusy">{{ T('running') }}</p>
          <p v-if="manager.detail?.error_code">{{ T(manager.detail.error_code) }}</p>
          <template v-if="manager.detail?.data">
            <h3>{{ manager.detail.data.title }}</h3
            ><p class="text-sm break-all"
              >{{ manager.detail.data.id }} · {{ T('revision') }}
              {{ manager.detail.data.revision }} · {{ T(manager.detail.data.status) }}</p
            >
            <div class="flex flex-wrap gap-2 my-3">
              <el-button id="memory-edit" @click="edit">{{ T('edit') }}</el-button>
              <el-button @click="openArchive">{{ T('archive') }}</el-button>
              <el-popconfirm
                :title="T('deleteWarning')"
                :confirm-button-text="T('forget')"
                :cancel-button-text="T('cancel')"
                :width="320"
                @confirm="manager.forget(detailTarget, manager.detail!.data!)"
                ><template #reference
                  ><el-button id="memory-delete" type="danger" plain>{{
                    T('forget')
                  }}</el-button></template
                ></el-popconfirm
              >
              <el-button @click="manager.get(detailTarget, manager.detail!.data!.id)">{{
                T('refresh')
              }}</el-button>
            </div>
            <!-- Markdown renderer disables HTML, images and active links. -->
            <!-- eslint-disable vue/no-v-html -->
            <div
              class="memory-markdown"
              v-html="renderMemoryMarkdown(manager.detail.data.content)"
            />
            <!-- eslint-enable vue/no-v-html -->
            <dl class="text-sm mt-4"
              ><dt>{{ T('reason') }}</dt
              ><dd>{{ manager.detail.data.change_reason }}</dd
              ><dt>{{ T('source') }}</dt
              ><dd
                >{{ manager.detail.data.source.kind }} · {{ manager.detail.data.source.agent
                }}<br />{{ manager.detail.data.source.description }}<br />{{
                  manager.detail.data.source.uri
                }}</dd
              ><dt>{{ T('updated') }}</dt
              ><dd>{{ manager.detail.data.updated_at }}</dd></dl
            >
          </template>
        </section>
      </div>
      <el-collapse class="mt-6"
        ><el-collapse-item :title="T('setup')" name="setup"><MemorySetup /></el-collapse-item
      ></el-collapse>
      <MemoryEditor
        v-model="editorOpen"
        :target="editorTarget"
        :current="editing"
        :independent="independent"
        @saved="refresh()"
      />
      <el-dialog v-model="archiveOpen" :title="T('archive')" width="480px"
        ><el-input v-model="archiveReason" :placeholder="T('reason')" /><template #footer
          ><el-button :loading="manager.mutation?.status === 'running'" @click="archive">{{
            T('save')
          }}</el-button></template
        ></el-dialog
      >
    </main>
  </el-scrollbar>
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
    archiveReason = ref('')
  const editing = ref<MemoryView>(),
    editorTarget = ref<MemoryTarget>({ scope: 'global' }),
    detailTarget = ref<MemoryTarget>({ scope: 'global' })
  const selectedProject = computed(() =>
    manager.projectsResult?.data?.find((p) => p.projectId === scopeKey.value)
  )
  const target = computed<MemoryTarget>(() =>
    scopeKey.value === 'global'
      ? { scope: 'global' }
      : scopeKey.value === 'path'
        ? { scope: 'project', project_path: projectPath.value }
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
  let lastSearch: { target: MemoryTarget; filters: ReturnType<typeof filters> } | undefined
  function refresh() {
    lastSearch = { target: { ...target.value }, filters: filters() }
    void manager.search(lastSearch.target, lastSearch.filters)
    void manager.loadProjects()
  }
  function nextPage() {
    if (lastSearch)
      void manager.search(lastSearch.target, {
        ...lastSearch.filters,
        cursor: manager.searchResult?.data?.next_cursor
      })
  }
  function changeScope() {
    manager.clearDetail()
    void manager.savePreference(target.value)
    refresh()
  }
  function chooseCandidate(path: string) {
    scopeKey.value = 'path'
    projectPath.value = path
    changeScope()
  }
  function select(hit: SearchHit) {
    detailTarget.value =
      hit.scope === 'global' ? { scope: 'global' } : { projectId: hit.projectId! }
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
  function openArchive() {
    archiveOpen.value = true
    archiveReason.value = ''
  }
  async function archive() {
    if (!manager.detail?.data) return
    const result = await manager.archive(
      detailTarget.value,
      manager.detail.data,
      archiveReason.value
    )
    if (result.outcome === 'success') {
      archiveOpen.value = false
      refresh()
      void manager.get(detailTarget.value, manager.detail.data.id)
    }
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
  .memory-page {
    max-width: 1400px;
    margin: 0 auto;
    color: var(--el-text-color-primary);
  }
  h2 {
    font-size: 1.4rem;
    font-weight: 600;
  }
  h3 {
    font-size: 1.15rem;
    font-weight: 600;
  }
  header p,
  small {
    color: var(--el-text-color-secondary);
  }
  .filters {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  .memory-workspace {
    display: grid;
    grid-template-columns: minmax(260px, 2fr) minmax(0, 3fr);
    gap: 24px;
    margin-top: 20px;
  }
  .memory-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    text-align: left;
    padding: 14px;
    margin-bottom: 8px;
    border: 1px solid var(--el-border-color);
    border-radius: 6px;
    background: var(--el-bg-color);
  }
  .memory-row:hover,
  .memory-row.selected {
    border-color: var(--el-color-primary);
    background: var(--el-fill-color-light);
  }
  .memory-detail {
    min-width: 0;
    border-left: 1px solid var(--el-border-color);
    padding-left: 24px;
    overflow-wrap: anywhere;
  }
  .operation {
    border: 1px solid var(--el-border-color);
    background: var(--el-fill-color-light);
    border-radius: 6px;
  }
  .memory-markdown {
    line-height: 1.7;
  }
  .memory-markdown :deep(pre) {
    overflow: auto;
    padding: 12px;
    background: var(--el-fill-color-light);
  }
  .memory-markdown :deep(p) {
    margin: 10px 0;
  }
  dt {
    color: var(--el-text-color-secondary);
    margin-top: 12px;
  }
  @media (max-width: 900px) {
    .filters {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .memory-workspace {
      grid-template-columns: 1fr;
    }
    .memory-detail {
      padding: 16px 0 0;
      border-left: 0;
      border-top: 1px solid var(--el-border-color);
    }
  }
</style>
