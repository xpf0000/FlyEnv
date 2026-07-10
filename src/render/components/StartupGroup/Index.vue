<template>
  <div class="soft-index-panel main-right-panel startup-group-page">
    <div class="flex flex-shrink-0 items-center justify-between gap-4 py-3">
      <div>
        <h2 class="text-xl font-semibold">{{ I18nT('common.startupGroup.title') }}</h2>
        <p class="text-sm text-zinc-500">{{ I18nT('common.startupGroup.description') }}</p>
      </div>
      <el-button type="primary" @click="openEditor()">
        {{ I18nT('common.startupGroup.add') }}
      </el-button>
    </div>

    <div class="main-block startup-group-main">
      <el-empty v-if="groups.length === 0" :description="I18nT('common.startupGroup.noGroups')">
        <el-button type="primary" @click="openEditor()">
          {{ I18nT('common.startupGroup.add') }}
        </el-button>
      </el-empty>

      <div v-else class="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        <GroupCard
          v-for="group in groups"
          :key="group.id"
          :group="group"
          :state="stateMap[group.id] || 'stopped'"
          :running-count="runningMap[group.id] || 0"
          :member-labels="group.items.map(itemLabel)"
          :is-default="config.defaultStartupGroupId === group.id"
          :busy="startupGroupRuntime.runner.isExecuting"
          @start="execute($event, 'start')"
          @stop="execute($event, 'stop')"
          @edit="openEditor"
          @delete="removeGroup"
          @default-change="defaultChange"
        />
      </div>
    </div>

    <GroupEditor v-model="editorVisible" :group="editingGroup" @saved="refreshAfterMutation" />
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, reactive, ref, watch } from 'vue'
  import { ElMessageBox } from 'element-plus'

  import { I18nT } from '@lang/index'
  import type {
    StartupGroup,
    StartupGroupCardState,
    StartupGroupItem,
    StartupGroupRunResult
  } from '@/core/StartupGroup'
  import type { StartupGroupCandidate } from '@/core/StartupGroupRuntime'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import GroupCard from './GroupCard.vue'
  import GroupEditor from './GroupEditor.vue'
  import { startupGroupRuntime } from './runtime'
  import { useStartupGroupStore } from './store'

  const store = useStartupGroupStore()
  const { groups, config } = store
  const stateMap = reactive<Record<string, StartupGroupCardState>>({})
  const runningMap = reactive<Record<string, number>>({})
  const candidates = ref<StartupGroupCandidate[]>([])
  const editorVisible = ref(false)
  const editingGroup = ref<StartupGroup>()

  const candidateByKey = computed(
    () => new Map(candidates.value.map((candidate) => [candidate.key, candidate]))
  )
  const itemKey = (item: StartupGroupItem) =>
    item.type === 'service-version'
      ? `service-version:${item.module}:${item.versionPath}`
      : `language-project:${item.module}:${item.projectId}`
  const itemLabel = (item: StartupGroupItem) =>
    candidateByKey.value.get(itemKey(item))?.label ??
    (item.type === 'service-version'
      ? `${item.module} · ${item.versionBin}`
      : `${item.module} · ${item.projectId}`)

  const refreshGroup = async (group: StartupGroup) => {
    const states = await Promise.all(
      group.items.map((item) => startupGroupRuntime.runner.getItemState(item))
    )
    stateMap[group.id] = states.includes('invalid')
      ? 'invalid'
      : states.includes('executing')
        ? 'executing'
        : states.length === 0 || states.every((state) => state === 'stopped')
          ? 'stopped'
          : states.every((state) => state === 'running')
            ? 'running'
            : 'partial-running'
    runningMap[group.id] = states.filter((state) => state === 'running').length
  }

  const refreshAll = async () => {
    candidates.value = await startupGroupRuntime.listCandidates()
    await Promise.all(groups.value.map(refreshGroup))
  }

  const openEditor = (group?: StartupGroup) => {
    editingGroup.value = group
    editorVisible.value = true
  }

  const resultMessage = (result: StartupGroupRunResult) => {
    const lines = result.members.map((member) => {
      const error = member.error ? `: ${member.error}` : ''
      return `${itemLabel(member.item)} — ${I18nT(`common.startupGroup.outcome.${member.outcome}`)}${error}`
    })
    return lines.join('<br/>') || I18nT('base.success')
  }

  const execute = async (group: StartupGroup, action: 'start' | 'stop') => {
    try {
      const result = await startupGroupRuntime.runner.run(group, action)
      const hasError = result.members.some((item) => ['failed', 'invalid'].includes(item.outcome))
      if (hasError) MessageError(resultMessage(result))
      else MessageSuccess(resultMessage(result))
    } catch (error) {
      MessageError(error instanceof Error ? error.message : `${error}`)
    } finally {
      await refreshAll()
    }
  }

  const removeGroup = async (group: StartupGroup) => {
    try {
      await ElMessageBox.confirm(
        I18nT('common.startupGroup.deleteConfirm', { name: group.name }),
        I18nT('host.warning'),
        { type: 'warning' }
      )
      await store.remove(group.id)
      await refreshAll()
    } catch {}
  }

  const defaultChange = async (group: StartupGroup, enabled: boolean) => {
    const saved = await store.setDefault(enabled ? group.id : undefined)
    if (!saved) MessageError(I18nT('common.startupGroup.defaultEmptyDisabled'))
  }

  const refreshAfterMutation = async () => {
    editingGroup.value = undefined
    await refreshAll()
  }

  watch(
    () => groups.value.map((group) => `${group.id}:${group.updatedAt}`).join('|'),
    () => refreshAll(),
    { immediate: false }
  )
  onMounted(refreshAll)
</script>

<style scoped lang="scss">
  .startup-group-main {
    overflow: auto !important;
  }
</style>
