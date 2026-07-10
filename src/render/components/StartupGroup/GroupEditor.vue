<template>
  <el-dialog
    v-model="show"
    :title="group ? I18nT('common.startupGroup.edit') : I18nT('common.startupGroup.add')"
    width="760px"
    destroy-on-close
  >
    <el-steps :active="step" align-center class="mb-6">
      <el-step :title="I18nT('common.startupGroup.basicInfo')" />
      <el-step :title="I18nT('common.startupGroup.selectServices')" />
      <el-step :title="I18nT('common.startupGroup.startOrder')" />
    </el-steps>

    <div class="startup-group-editor-body">
      <el-form v-if="step === 0" label-position="top">
        <el-form-item :label="I18nT('common.label.name')" required>
          <el-input v-model="draft.name" maxlength="64" show-word-limit />
        </el-form-item>
        <el-form-item :label="I18nT('common.label.description')">
          <el-input
            v-model="draft.description"
            type="textarea"
            :rows="4"
            maxlength="240"
            show-word-limit
          />
        </el-form-item>
        <el-form-item :label="I18nT('common.startupGroup.color')">
          <el-color-picker v-model="draft.color" />
        </el-form-item>
      </el-form>

      <div v-else-if="step === 1" v-loading="loading" class="flex flex-col gap-4">
        <el-empty
          v-if="!loading && candidates.length === 0"
          :description="I18nT('common.startupGroup.noCandidates')"
        />
        <el-checkbox-group v-else v-model="selectedKeys" @change="syncSelectedItems">
          <div v-for="section in groupedCandidates" :key="section.label" class="mb-5">
            <div class="mb-2 border-b pb-2 font-semibold">{{ section.label }}</div>
            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div
                v-for="candidate in section.items"
                :key="candidate.key"
                class="rounded border border-zinc-200 p-3 dark:border-zinc-700"
              >
                <el-checkbox :value="candidate.key">
                  <span class="break-all">{{ candidate.label }}</span>
                </el-checkbox>
                <div
                  v-if="candidateWarnings.get(candidate.key)?.length"
                  class="mt-1 pl-6 text-xs text-amber-500"
                >
                  {{ warningLabel(candidate.key) }}
                </div>
              </div>
            </div>
          </div>
        </el-checkbox-group>

        <div v-if="invalidItems.length" class="rounded border border-red-300 p-3">
          <div class="mb-2 text-red-500">{{ I18nT('common.startupGroup.invalidMember') }}</div>
          <div
            v-for="item in invalidItems"
            :key="item.id"
            class="flex items-center justify-between gap-3 py-1"
          >
            <span class="truncate">{{ fallbackItemLabel(item) }}</span>
            <el-button link type="danger" @click="removeItem(item.id)">
              {{ I18nT('common.action.delete') }}
            </el-button>
          </div>
        </div>
      </div>

      <div v-else>
        <el-empty
          v-if="draft.items.length === 0"
          :description="I18nT('common.startupGroup.emptyMembers')"
        />
        <draggable
          v-else
          v-model="draft.items"
          item-key="id"
          handle=".startup-group-drag-handle"
          class="flex flex-col gap-2"
        >
          <template #item="{ element, index }">
            <div
              class="flex items-center gap-3 rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700"
            >
              <span class="w-7 text-center text-zinc-500">{{ index + 1 }}</span>
              <yb-icon
                class="startup-group-drag-handle h-5 w-5 cursor-move"
                :svg="import('@/svg/handle.svg?raw')"
              />
              <span class="min-w-0 flex-1 truncate">{{ itemLabel(element) }}</span>
              <el-tag v-if="!candidateFor(element)" type="danger" effect="plain">
                {{ I18nT('common.startupGroup.invalid') }}
              </el-tag>
              <el-button link type="danger" @click="removeItem(element.id)">
                {{ I18nT('common.action.delete') }}
              </el-button>
            </div>
          </template>
        </draggable>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-between">
        <el-button :disabled="step === 0" @click="step -= 1">
          {{ I18nT('common.startupGroup.previous') }}
        </el-button>
        <div class="flex gap-2">
          <el-button @click="show = false">{{ I18nT('base.cancel') }}</el-button>
          <el-button v-if="step < 2" type="primary" @click="nextStep">
            {{ I18nT('common.startupGroup.next') }}
          </el-button>
          <el-button v-else type="primary" :loading="saving" @click="save">
            {{ I18nT('common.action.save') }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed, reactive, ref, watch } from 'vue'
  import draggable from 'vuedraggable'

  import { I18nT } from '@lang/index'
  import {
    getStartupGroupItemKey,
    type StartupGroup,
    type StartupGroupDraft,
    type StartupGroupItem
  } from '@/core/StartupGroup'
  import {
    getStartupGroupCandidateWarnings,
    startupGroupCandidateMatchesItem,
    syncStartupGroupSelectedItems,
    type StartupGroupCandidate
  } from '@/core/StartupGroupRuntime'
  import { MessageWarning } from '@/util/Element'
  import { uuid } from '@/util/Index'
  import { startupGroupRuntime } from './runtime'
  import { useStartupGroupStore } from './store'

  const props = defineProps<{
    modelValue: boolean
    group?: StartupGroup
  }>()
  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    saved: []
  }>()

  const store = useStartupGroupStore()
  const show = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
  })
  const step = ref(0)
  const loading = ref(false)
  const saving = ref(false)
  const candidates = ref<StartupGroupCandidate[]>([])
  const selectedKeys = ref<string[]>([])
  const draft = reactive<StartupGroupDraft>({
    name: '',
    description: '',
    color: '#409eff',
    items: []
  })

  const candidateByKey = computed(
    () => new Map(candidates.value.map((candidate) => [candidate.key, candidate]))
  )
  const groupedCandidates = computed(() => {
    const grouped = new Map<string, StartupGroupCandidate[]>()
    for (const candidate of candidates.value) {
      const items = grouped.get(candidate.moduleLabel) ?? []
      items.push(candidate)
      grouped.set(candidate.moduleLabel, items)
    }
    return [...grouped.entries()].map(([label, items]) => ({ label, items }))
  })
  const candidateWarnings = computed(() =>
    getStartupGroupCandidateWarnings(candidates.value, selectedKeys.value)
  )
  const candidateFor = (item: StartupGroupItem) => {
    const candidate = candidateByKey.value.get(getStartupGroupItemKey(item))
    return candidate && startupGroupCandidateMatchesItem(candidate, item) ? candidate : undefined
  }
  const invalidItems = computed(() => draft.items.filter((item) => !candidateFor(item)))

  const itemKey = getStartupGroupItemKey
  const fallbackItemLabel = (item: StartupGroupItem) =>
    item.type === 'service-version'
      ? `${item.module} · ${item.versionBin}`
      : `${item.module} · ${item.projectId}`
  const itemLabel = (item: StartupGroupItem) => candidateFor(item)?.label ?? fallbackItemLabel(item)
  const warningLabel = (key: string) => {
    const warnings = candidateWarnings.value.get(key) ?? []
    return warnings
      .map((warning) =>
        I18nT(
          warning === 'same-port'
            ? 'common.startupGroup.samePortWarning'
            : 'common.startupGroup.sameModuleWarning'
        )
      )
      .join(' · ')
  }

  const reset = async () => {
    step.value = 0
    draft.name = props.group?.name ?? ''
    draft.description = props.group?.description ?? ''
    draft.color = props.group?.color ?? '#409eff'
    draft.items = (props.group?.items ?? []).map((item) => ({ ...item }))
    loading.value = true
    try {
      candidates.value = await startupGroupRuntime.listCandidates()
      selectedKeys.value = draft.items.filter(candidateFor).map(itemKey)
    } finally {
      loading.value = false
    }
  }

  watch(
    () => props.modelValue,
    (visible) => visible && reset(),
    { immediate: true }
  )

  const syncSelectedItems = () => {
    draft.items = syncStartupGroupSelectedItems(
      draft.items,
      candidates.value,
      selectedKeys.value,
      uuid
    )
  }

  const removeItem = (id: string) => {
    draft.items = draft.items.filter((item) => item.id !== id)
    selectedKeys.value = draft.items.filter(candidateFor).map(itemKey)
  }

  const nextStep = () => {
    if (step.value === 0 && !draft.name.trim()) {
      MessageWarning(I18nT('common.startupGroup.nameRequired'))
      return
    }
    if (step.value === 1) syncSelectedItems()
    step.value += 1
  }

  const save = async () => {
    if (!draft.name.trim()) {
      MessageWarning(I18nT('common.startupGroup.nameRequired'))
      step.value = 0
      return
    }
    saving.value = true
    try {
      const data: StartupGroupDraft = {
        name: draft.name.trim(),
        description: draft.description?.trim() || undefined,
        color: draft.color || undefined,
        items: draft.items.map((item) => ({ ...item }))
      }
      if (props.group) await store.update(props.group.id, data)
      else await store.add(data)
      emit('saved')
      show.value = false
    } finally {
      saving.value = false
    }
  }
</script>

<style scoped lang="scss">
  .startup-group-editor-body {
    min-height: 390px;
    max-height: 58vh;
    overflow: auto;
    padding: 0 4px;
  }
</style>
