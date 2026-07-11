<template>
  <el-dialog
    v-model="show"
    :title="group ? I18nT('common.startupGroup.edit') : I18nT('common.startupGroup.add')"
    width="760px"
    class="el-dialog-content-flex-1 h-[75%] dark:bg-[#1d2033]"
    destroy-on-close
  >
    <div class="h-full overflow-hidden flex flex-col">
      <el-steps :active="step" align-center class="mb-6 flex-shrink-0">
        <el-step :title="I18nT('common.startupGroup.basicInfo')" />
        <el-step :title="I18nT('common.startupGroup.selectServices')" />
        <el-step :title="I18nT('common.startupGroup.startOrder')" />
      </el-steps>

      <div class="flex-1 overflow-hidden">
        <el-scrollbar>
          <div class="startup-group-editor-body min-h-full">
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

            <div
              v-else-if="step === 1"
              v-loading="loading"
              class="flex flex-col gap-4 min-h-8 h-full"
            >
              <el-empty
                v-if="!loading && candidates.length === 0"
                :description="I18nT('common.startupGroup.noCandidates')"
              />
              <el-collapse
                v-else
                v-model="expandedCategories"
                class="startup-group-category-collapse"
              >
                <el-collapse-item
                  v-for="category in candidateSections"
                  :key="category.key"
                  :name="category.key"
                >
                  <template #title>
                    <span class="font-semibold pl-2">{{ I18nT(`aside.${category.key}`) }}</span>
                  </template>

                  <el-collapse
                    :model-value="expandedModules[category.key] ?? []"
                    class="startup-group-module-collapse ml-4"
                    @update:model-value="setExpandedModules(category.key, $event)"
                  >
                    <el-collapse-item
                      v-for="module in category.modules"
                      :key="module.key"
                      :name="module.key"
                    >
                      <template #title>
                        <span class="font-medium pl-1">{{ module.label }}</span>
                      </template>

                      <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div
                          v-for="candidate in module.items"
                          :key="candidate.key"
                          class="startup-group-candidate-card cursor-pointer rounded border p-3"
                          :class="
                            isCandidateSelected(candidate)
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                              : 'border-zinc-200 dark:border-zinc-700'
                          "
                          role="button"
                          tabindex="0"
                          @click="toggleCandidate(candidate)"
                          @keydown.enter.prevent="toggleCandidate(candidate)"
                        >
                          <div class="flex items-start gap-2">
                            <el-checkbox
                              v-if="startupGroupCandidateAllowsMultiple(candidate)"
                              :model-value="isCandidateSelected(candidate)"
                              @click.stop
                              @change="updateCandidateSelection(candidate, Boolean($event))"
                            />
                            <el-radio
                              v-else
                              :model-value="selectedSingleKey(candidate)"
                              :value="candidate.key"
                              @click.capture.prevent.stop="toggleCandidate(candidate)"
                            />
                            <div class="min-w-0 flex-1">
                              <div class="break-all font-medium">
                                {{ candidate.displayName || I18nT('common.startupGroup.noRemark') }}
                              </div>
                              <div class="mt-1 break-all text-xs text-zinc-500">
                                {{ candidate.displayPath }}
                              </div>
                              <div
                                v-if="candidateWarnings.get(candidate.key)?.length"
                                class="mt-1 text-xs text-amber-500"
                              >
                                {{ warningLabel(candidate.key) }}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </el-collapse-item>
                  </el-collapse>
                </el-collapse-item>
              </el-collapse>
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
                    <el-button link type="danger" @click="removeItem(element.id)">
                      {{ I18nT('common.action.delete') }}
                    </el-button>
                  </div>
                </template>
              </draggable>
            </div>
          </div>
        </el-scrollbar>
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
  import { AppModuleTypeList, type AllAppModule, type AllAppModuleType } from '@/core/type'
  import { MessageWarning } from '@/util/Element'
  import { StartupGroup } from './class/StartupGroup'
  import { StartupGroupManager } from './class/StartupGroupManager'
  import type { StartupGroupCandidateData, StartupGroupDraft, StartupGroupItem } from './type'

  const props = defineProps<{
    modelValue: boolean
    group?: StartupGroup
  }>()
  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    saved: []
  }>()

  const store = StartupGroupManager.store
  const candidateManager = StartupGroupManager.candidate
  const show = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
  })
  const step = ref(0)
  const loading = ref(false)
  const saving = ref(false)
  const candidates = ref<StartupGroupCandidateData[]>([])
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

  type CandidateModuleSection = {
    key: AllAppModule
    label: string
    items: StartupGroupCandidateData[]
  }

  type CandidateCategorySection = {
    key: AllAppModuleType
    modules: CandidateModuleSection[]
  }

  const expandedCategories = ref<AllAppModuleType[]>([])
  const expandedModules = reactive<Partial<Record<AllAppModuleType, AllAppModule[]>>>({})

  const candidateSections = computed<CandidateCategorySection[]>(() => {
    const categories = new Map<AllAppModuleType, Map<AllAppModule, CandidateModuleSection>>()

    for (const candidate of candidates.value) {
      let modules = categories.get(candidate.moduleType)
      if (!modules) {
        modules = new Map()
        categories.set(candidate.moduleType, modules)
      }
      const moduleKey = candidate.item.module
      let module = modules.get(moduleKey)
      if (!module) {
        module = { key: moduleKey, label: candidate.moduleLabel, items: [] }
        modules.set(moduleKey, module)
      }
      module.items.push(candidate)
    }

    return AppModuleTypeList.flatMap((key) => {
      const modules = categories.get(key)
      return modules ? [{ key, modules: [...modules.values()] }] : []
    })
  })
  const candidateWarnings = computed(() =>
    candidateManager.warnings(candidates.value, selectedKeys.value)
  )
  const candidateFor = (item: StartupGroupItem) => {
    const candidate = candidateByKey.value.get(StartupGroup.itemKey(item))
    return candidate && candidateManager.matchesItem(candidate, item) ? candidate : undefined
  }

  const isCandidateSelected = (candidate: StartupGroupCandidateData) =>
    selectedKeys.value.includes(candidate.key)

  const selectedSingleKey = (candidate: StartupGroupCandidateData) =>
    selectedKeys.value.find((key) => {
      const selected = candidateByKey.value.get(key)
      return (
        selected?.item.type === 'service-version' && selected.item.module === candidate.item.module
      )
    })

  const updateCandidateSelection = (candidate: StartupGroupCandidateData, selected: boolean) => {
    selectedKeys.value = candidateManager.updateSelection(
      selectedKeys.value,
      candidate,
      candidates.value,
      selected
    )
  }

  const toggleCandidate = (candidate: StartupGroupCandidateData) => {
    selectedKeys.value = candidateManager.toggleSelection(
      selectedKeys.value,
      candidate,
      candidates.value
    )
  }

  const setExpandedModules = (
    category: AllAppModuleType,
    value: string | number | Array<string | number>
  ) => {
    const values = Array.isArray(value) ? value : [value]
    expandedModules[category] = values.map((item) => `${item}` as AllAppModule)
  }

  const itemKey = StartupGroup.itemKey
  const startupGroupCandidateAllowsMultiple = (candidate: StartupGroupCandidateData) =>
    candidateManager.allowsMultiple(candidate)
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
      candidates.value = await StartupGroupManager.runtime.listCandidates()
      draft.items = candidateManager.filterValidItems(draft.items, candidates.value)
      selectedKeys.value = candidateManager.normalizeSelection(
        draft.items.map(itemKey),
        candidates.value
      )
      draft.items = candidateManager.syncSelectedItems(
        draft.items,
        candidates.value,
        selectedKeys.value
      )

      const selected = new Set(selectedKeys.value)
      expandedCategories.value = candidateSections.value
        .filter((category) =>
          category.modules.some((module) =>
            module.items.some((candidate) => selected.has(candidate.key))
          )
        )
        .map((category) => category.key)
      for (const key of Object.keys(expandedModules) as AllAppModuleType[]) {
        delete expandedModules[key]
      }
      for (const category of candidateSections.value) {
        expandedModules[category.key] = category.modules
          .filter((module) => module.items.some((candidate) => selected.has(candidate.key)))
          .map((module) => module.key)
      }
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
    draft.items = candidateManager.syncSelectedItems(
      draft.items,
      candidates.value,
      selectedKeys.value
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
    padding: 0 4px;
  }
</style>
