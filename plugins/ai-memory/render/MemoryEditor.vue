<template>
  <el-dialog
    :model-value="modelValue"
    :title="current ? T('edit') : T('newMemory')"
    width="720px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-position="top" @submit.prevent="save">
      <div class="grid grid-cols-2 gap-4">
        <el-form-item :label="T('memoryTitle')"
          ><el-input id="memory-title" v-model="draft.title" :maxlength="120"
        /></el-form-item>
        <el-form-item :label="T('type')"
          ><el-select v-model="draft.type"
            ><el-option
              v-for="type in MEMORY_TYPES"
              :key="type"
              :value="type"
              :label="type" /></el-select
        ></el-form-item>
        <el-form-item :label="T('topic')"
          ><el-input v-model="draft.topic" :maxlength="160"
        /></el-form-item>
        <el-form-item :label="T('tags')"><el-input v-model="tags" /></el-form-item>
      </div>
      <el-form-item :label="T('summary')"
        ><el-input
          id="memory-summary"
          v-model="draft.summary"
          type="textarea"
          :rows="2"
          :maxlength="600"
      /></el-form-item>
      <el-form-item :label="`${T('content')} (${bodyBytes} / 16384 bytes)`"
        ><el-input id="memory-content" v-model="draft.content" type="textarea" :rows="7"
      /></el-form-item>
      <div class="grid grid-cols-2 gap-4">
        <el-form-item :label="T('sourceKind')"
          ><el-select v-model="draft.source.kind"
            ><el-option
              v-for="kind in sourceKinds"
              :key="kind"
              :label="kind"
              :value="kind" /></el-select
        ></el-form-item>
        <el-form-item :label="T('sourceAgent')"
          ><el-input v-model="draft.source.agent" :maxlength="120"
        /></el-form-item>
      </div>
      <el-form-item :label="T('sourceDescription')"
        ><el-input v-model="draft.source.description" :maxlength="600"
      /></el-form-item>
      <el-form-item :label="T('sourceUri')"
        ><el-input v-model="uri" :maxlength="2048"
      /></el-form-item>
      <div class="grid grid-cols-2 gap-4">
        <el-form-item :label="T('expiresAt')"><el-input v-model="expires" /></el-form-item>
        <el-form-item :label="T('occurredAt')"><el-input v-model="occurred" /></el-form-item>
      </div>
      <el-checkbox v-model="draft.pinned">{{ T('pinned') }}</el-checkbox>
      <el-form-item v-if="current" :label="T('reason')"
        ><el-input id="memory-reason" v-model="reason" :maxlength="600"
      /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ T('cancel') }}</el-button>
      <el-button
        id="memory-save"
        type="primary"
        :loading="manager.mutation?.status === 'running'"
        :disabled="bodyBytes > 16384 || manager.mutation?.result?.outcome === 'unknown'"
        @click="save"
        >{{ T('save') }}</el-button
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { MEMORY_TYPES, type MemoryDraft, type MemoryView } from '../shared'
  import type { MemoryTarget } from './controller'
  import { MemoryManager as manager } from './manager'
  import { MemoryT as T } from './lang'
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
    source: { kind: 'user_statement', agent: 'FlyEnv UI', description: '' },
    status: 'active',
    pinned: false
  })
  const draft = ref<MemoryDraft>(empty())
  const tags = ref(''),
    reason = ref(''),
    uri = ref(''),
    expires = ref(''),
    occurred = ref('')
  const bodyBytes = computed(() => new TextEncoder().encode(draft.value.content).byteLength)
  watch(
    () => props.modelValue,
    (open) => {
      if (!open) return
      const value = props.current
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
    }
  )
  async function save() {
    const value: MemoryDraft = {
      ...draft.value,
      tags: tags.value
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      expires_at: expires.value || null,
      occurred_at: occurred.value || null,
      source: { ...draft.value.source, ...(uri.value ? { uri: uri.value } : {}) }
    }
    if (!uri.value) delete value.source.uri
    const result = props.current
      ? await manager.save(props.target, value, props.current, reason.value)
      : await manager.mutate(props.target, 'store', {
          ...value,
          ...(props.independent ? { create_project: true } : {})
        })
    if (result.outcome === 'success') {
      emit('update:modelValue', false)
      emit('saved')
    }
  }
</script>
