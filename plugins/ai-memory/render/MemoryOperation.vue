<template>
  <el-alert
    v-if="
      operation &&
      (operation.status === 'running' ||
        (result && !['success', 'already_deleted'].includes(result.outcome)))
    "
    id="memory-operation"
    :type="
      operation.status === 'running'
        ? 'info'
        : result?.outcome === 'unknown' || result?.outcome === 'partial'
          ? 'warning'
          : 'error'
    "
    :closable="false"
    role="status"
    class="memory-operation"
  >
    <template #title>{{
      T(operation.status === 'running' ? 'running' : (result?.outcome ?? 'failed'))
    }}</template>
    <p v-if="result?.error_code">{{ T(result.error_code) }}</p>
    <p v-for="(warning, index) in result?.warnings ?? []" :key="index">{{ T(warning.code) }}</p>
    <el-button
      v-if="['unknown', 'partial', 'failed', 'busy'].includes(result?.outcome ?? '')"
      :loading="operation.status === 'running'"
      link
      type="primary"
      @click="retry"
      >{{ T('retry') }}</el-button
    >
  </el-alert>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import { MemoryManager as manager } from './manager'
  import { MemoryT as T } from './lang'
  const props = defineProps<{ requestId?: string; global?: boolean }>()
  const emit = defineEmits<{ resolved: [] }>()
  const operation = computed(() =>
    props.global ? manager.mutation : manager.mutationFor(props.requestId)
  )
  const result = computed(() => operation.value?.result)
  async function retry() {
    const requestId = operation.value?.input.request_id
    if (!requestId) return
    const response = await manager.retryMutation()
    if (manager.mutationFor(requestId) && ['success', 'already_deleted'].includes(response.outcome))
      emit('resolved')
  }
</script>
<style scoped>
  .memory-operation {
    margin-bottom: 16px;
  }
</style>
