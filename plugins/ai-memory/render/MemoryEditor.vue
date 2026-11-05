<template>
  <el-dialog
    :model-value="modelValue"
    :title="current ? T('edit') : T('newMemory')"
    width="min(720px, 94vw)"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-position="top" @submit.prevent="save">
      <el-form-item :label="T('memoryTitle')" required :error="fieldError(draft.title)"
        ><el-input id="memory-title" v-model="draft.title" maxlength="120"
      /></el-form-item>
      <el-form-item :label="T('summary')" required :error="fieldError(draft.summary)"
        ><el-input
          id="memory-summary"
          v-model="draft.summary"
          type="textarea"
          :rows="2"
          maxlength="600"
          :placeholder="T('summaryHelp')"
      /></el-form-item>
      <el-form-item
        :label="T('content')"
        required
        :error="bodyBytes > 16384 ? T('bodyTooLarge') : fieldError(draft.content)"
        ><el-input
          id="memory-content"
          v-model="draft.content"
          type="textarea"
          :rows="8"
          :placeholder="T('contentHelp')"
      /></el-form-item>
      <el-form-item v-if="current" :label="T('reason')" required :error="fieldError(reason)"
        ><el-input
          id="memory-reason"
          v-model="reason"
          maxlength="600"
          :placeholder="T('reasonHelp')"
      /></el-form-item>
      <el-collapse v-model="advanced"
        ><el-collapse-item :title="T('moreOptions')" name="options">
          <div class="memory-editor-grid">
            <el-form-item :label="T('type')"
              ><el-select v-model="draft.type"
                ><el-option
                  v-for="type in MEMORY_TYPES"
                  :key="type"
                  :value="type"
                  :label="T(type)" /></el-select
            ></el-form-item>
            <el-form-item :label="T('topic')"
              ><el-input v-model="draft.topic" maxlength="160" :placeholder="T('topicHelp')"
            /></el-form-item>
            <el-form-item :label="T('tags')"><el-input v-model="tags" /></el-form-item>
            <el-form-item :label="T('sourceKind')"
              ><el-select v-model="draft.source.kind"
                ><el-option
                  v-for="kind in sourceKinds"
                  :key="kind"
                  :label="T(kind)"
                  :value="kind" /></el-select
            ></el-form-item>
            <el-form-item :label="T('sourceAgent')" required :error="fieldError(draft.source.agent)"
              ><el-input v-model="draft.source.agent" maxlength="120"
            /></el-form-item>
            <el-form-item
              :label="T('sourceDescription')"
              required
              :error="fieldError(draft.source.description)"
              ><el-input v-model="draft.source.description" maxlength="600"
            /></el-form-item>
            <el-form-item :label="T('sourceUri')"
              ><el-input v-model="uri" maxlength="2048"
            /></el-form-item>
            <el-form-item :label="T('expiresAt')"
              ><el-date-picker
                v-model="expires"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
                clearable
            /></el-form-item>
            <el-form-item :label="T('occurredAt')"
              ><el-date-picker
                v-model="occurred"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
                clearable
            /></el-form-item>
          </div>
          <el-checkbox v-model="draft.pinned">{{ T('pinned') }}</el-checkbox>
        </el-collapse-item></el-collapse
      >
      <el-alert
        v-if="validationError"
        id="memory-validation"
        :title="validationError"
        type="error"
        :closable="false"
        class="mt-4"
      />
      <MemoryOperation
        v-if="submitted || manager.mutation?.result?.outcome === 'unknown'"
        :request-id="operationId"
        class="mt-4"
        @resolved="saved"
      />
      <el-button
        v-if="submitted && manager.mutation?.result?.outcome === 'conflict' && base"
        class="mt-3"
        :loading="manager.detailBusy"
        @click="reloadLatest"
        >{{ T('reloadLatest') }}</el-button
      >
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ T('cancel') }}</el-button>
      <el-button
        id="memory-save"
        type="primary"
        :loading="manager.mutation?.status === 'running'"
        :disabled="manager.mutation?.result?.outcome === 'unknown'"
        @click="save"
        >{{ T('save') }}</el-button
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { MEMORY_TYPES, type MemoryDraft, type MemoryView } from '../shared'
  import { validateInput } from '../core/validation'
  import type { MemoryTarget } from './controller'
  import { MemoryManager as manager } from './manager'
  import { MemoryT as T } from './lang'
  import MemoryOperation from './MemoryOperation.vue'
  import { editorTimestamp } from './presentation'
  const props = defineProps<{
    modelValue: boolean
    target: MemoryTarget
    current?: MemoryView
    independent?: boolean
  }>()
  const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>()
  const sourceKinds = ['user_statement', 'tool_result', 'document', 'agent_inference']
  const empty = (): MemoryDraft => ({
    type: 'note',
    title: '',
    topic: '',
    summary: '',
    tags: [],
    content: '',
    source: { kind: 'user_statement', agent: 'FlyEnv UI', description: T('manualSource') },
    status: 'active',
    pinned: false
  })
  const draft = ref<MemoryDraft>(empty()),
    base = ref<MemoryView>()
  const tags = ref(''),
    reason = ref(''),
    uri = ref(''),
    expires = ref(''),
    occurred = ref('')
  const advanced = ref<string[]>([]),
    tried = ref(false),
    submitted = ref(false),
    validationError = ref('')
  const operationId = ref<string>()
  const bodyBytes = computed(() => new TextEncoder().encode(draft.value.content).byteLength)
  const fieldError = (value: string) => (tried.value && !value.trim() ? T('required') : '')
  function load(value?: MemoryView) {
    base.value = value
    draft.value = value
      ? {
          type: value.type,
          title: value.title,
          topic: value.topic,
          summary: value.summary,
          content: value.content,
          tags: [...value.tags],
          source: { ...value.source },
          status: value.status,
          pinned: value.pinned
        }
      : empty()
    tags.value = value?.tags.join(', ') ?? ''
    reason.value = ''
    uri.value = value?.source.uri ?? ''
    expires.value = value?.expires_at ?? ''
    occurred.value = value?.occurred_at ?? ''
    tried.value = false
    validationError.value = ''
    submitted.value = false
    operationId.value = undefined
  }
  watch(
    () => props.modelValue,
    (open) => {
      if (open) {
        advanced.value = []
        load(props.current)
      }
    }
  )
  function saved() {
    emit('update:modelValue', false)
    emit('saved')
  }
  async function reloadLatest() {
    const response = await manager.get(props.target, base.value!.id)
    if (response.data) load(response.data)
    else validationError.value = T(response.error_code ?? response.outcome)
  }
  async function save() {
    tried.value = true
    validationError.value = ''
    const value: MemoryDraft = {
      ...draft.value,
      topic: draft.value.topic.trim() || draft.value.title.trim(),
      tags: tags.value
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      expires_at: editorTimestamp(expires.value),
      occurred_at: editorTimestamp(occurred.value),
      source: { ...draft.value.source }
    }
    if (uri.value.trim()) value.source.uri = uri.value.trim()
    else delete value.source.uri
    if (base.value && !reason.value.trim()) {
      validationError.value = T('required')
      return
    }
    try {
      validateInput('store', {
        ...value,
        scope: 'global',
        request_id: '00000000-0000-4000-8000-000000000000'
      })
    } catch {
      validationError.value = T(bodyBytes.value > 16384 ? 'bodyTooLarge' : 'invalid_input')
      if (!draft.value.source.agent.trim() || !draft.value.source.description.trim())
        advanced.value = ['options']
      return
    }
    submitted.value = true
    const flight = base.value
      ? manager.save(props.target, value, base.value, reason.value)
      : manager.mutate(props.target, 'store', {
          ...value,
          ...(props.independent ? { create_project: true } : {})
        })
    operationId.value = manager.mutation?.input.request_id
    const result = await flight
    if (result.outcome === 'success') saved()
  }
</script>
<style scoped>
  .memory-editor-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 16px;
    padding-top: 16px;
  }
  .memory-editor-grid :deep(.el-date-editor) {
    width: 100%;
  }
  @media (max-width: 700px) {
    .memory-editor-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
