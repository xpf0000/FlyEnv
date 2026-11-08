<template>
  <el-scrollbar>
    <section class="memory-calls">
      <div class="memory-calls-header">
        <div>
          <h2>{{ T('calls') }}</h2>
          <p class="memory-calls-help">{{ T('callsHelp') }}</p>
        </div>
        <el-button @click="manager.loadCalls()">{{ T('refresh') }}</el-button>
      </div>
      <el-alert
        v-if="manager.callsResult?.error_code"
        :title="T(manager.callsResult.error_code)"
        type="error"
        :closable="false"
      />
      <el-table
        :data="rows"
        :empty-text="T('noCalls')"
        row-key="call_id"
        class="memory-calls-table"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="memory-call-detail">
              <h3>{{ T('request') }}</h3>
              <pre>{{ format(row.request) }}</pre>
              <h3>{{ T('response') }}</h3>
              <pre>{{ format(row.response) }}</pre>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="T('time')" min-width="165">
          <template #default="{ row }">{{ displayDate(row.time) }}</template>
        </el-table-column>
        <el-table-column :label="T('operation')" min-width="110">
          <template #default="{ row }">{{
            T(row.tool?.replace('flyenv_memory_', '') ?? 'unknown')
          }}</template>
        </el-table-column>
        <el-table-column :label="T('client')" width="100">
          <template #default="{ row }">{{ row.client?.name ?? '—' }}</template>
        </el-table-column>
        <el-table-column :label="T('result')" min-width="120">
          <template #default="{ row }">
            {{ T(row.outcome) }}
            <p v-if="row.error_code">{{ T(row.error_code) }}</p>
          </template>
        </el-table-column>
        <el-table-column :label="T('duration')" width="100">
          <template #default="{ row }">{{
            row.duration_ms === undefined ? '—' : `${row.duration_ms} ms`
          }}</template>
        </el-table-column>
        <el-table-column :label="T('hits')" width="80">
          <template #default="{ row }">{{ row.hit_count ?? '—' }}</template>
        </el-table-column>
      </el-table>
    </section>
  </el-scrollbar>
</template>

<script setup lang="ts">
  import { computed, onMounted } from 'vue'
  import { MemoryManager as manager } from './manager'
  import { MemoryT as T } from './lang'
  import { displayDate } from './presentation'

  const rows = computed(() => [...(manager.callsResult?.data ?? [])].reverse())
  const format = (value: unknown) => JSON.stringify(value ?? {}, null, 2)

  onMounted(() => {
    void manager.loadCalls()
  })
</script>

<style scoped>
  .memory-calls {
    padding: 4px 16px 24px 0;
  }
  .memory-calls-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }
  h2 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 6px;
  }
  h3 {
    font-size: 13px;
    font-weight: 600;
    margin: 12px 0 6px;
  }
  .memory-calls-help {
    color: var(--el-text-color-secondary);
    line-height: 1.7;
  }
  .memory-calls-table {
    width: 100%;
  }
  .memory-call-detail {
    padding: 8px 20px 16px 48px;
  }
  pre {
    max-height: 360px;
    overflow: auto;
    padding: 12px;
    border-radius: 6px;
    background: var(--el-fill-color-light);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: text;
  }
</style>
