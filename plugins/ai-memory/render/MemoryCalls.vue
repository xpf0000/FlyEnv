<template>
  <section class="memory-calls">
    <div class="memory-calls-content">
      <header class="memory-calls-header">
        <div>
          <span class="memory-calls-eyebrow">MEMORY ACTIVITY</span>
          <h1>{{ T('calls') }}</h1>
          <p class="memory-calls-help">{{ T('callsIntro') }}</p>
        </div>
        <button class="memory-calls-refresh" type="button" @click="manager.loadCalls()">
          <RefreshRight aria-hidden="true" />{{ T('refresh') }}
        </button>
      </header>
      <div class="memory-calls-meta">
        <span class="memory-calls-session"><i />{{ T('callsSession') }}</span>
        <span
          >{{ T('callsCount') }} <strong>{{ rows.length }}</strong></span
        >
      </div>
      <p v-if="manager.callsResult?.error_code" class="memory-calls-error" role="alert">
        <Warning aria-hidden="true" />{{ T(manager.callsResult.error_code) }}
      </p>
      <div class="memory-calls-panel">
        <el-table :data="rows" row-key="call_id" class="memory-calls-table">
          <template #empty>
            <div class="memory-calls-empty">
              <Clock aria-hidden="true" />
              <strong>{{ T('callsEmpty') }}</strong>
              <p>{{ T('callsEmptyHelp') }}</p>
            </div>
          </template>
          <el-table-column type="expand" width="44">
            <template #default="{ row }">
              <div class="memory-call-detail">
                <section
                  ><h2>{{ T('request') }}</h2
                  ><pre tabindex="0" :aria-label="T('request')">{{ format(row.request) }}</pre>
                </section>
                <section
                  ><h2>{{ T('response') }}</h2
                  ><pre tabindex="0" :aria-label="T('response')">{{ format(row.response) }}</pre>
                </section>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="T('time')" min-width="170">
            <template #default="{ row }"
              ><span class="memory-call-time">{{ displayDate(row.time) }}</span></template
            >
          </el-table-column>
          <el-table-column :label="T('operation')" min-width="160">
            <template #default="{ row }"
              ><span class="memory-call-tool">{{
                T(row.tool?.replace('flyenv_memory_', '') ?? 'unknown')
              }}</span></template
            >
          </el-table-column>
          <el-table-column :label="T('client')" min-width="125" show-overflow-tooltip>
            <template #default="{ row }"
              ><span class="memory-call-client">{{ row.client?.name ?? '—' }}</span></template
            >
          </el-table-column>
          <el-table-column :label="T('result')" min-width="150">
            <template #default="{ row }">
              <span class="memory-call-outcome" :class="row.outcome" :title="T(row.outcome)">{{
                outcomeLabel(row.outcome)
              }}</span>
              <p v-if="row.error_code" class="memory-call-error" :title="T(row.error_code)">{{
                T(row.error_code)
              }}</p>
            </template>
          </el-table-column>
          <el-table-column :label="T('duration')" width="105" align="right">
            <template #default="{ row }"
              ><span class="memory-call-number">{{
                row.duration_ms === undefined ? '—' : `${row.duration_ms} ms`
              }}</span></template
            >
          </el-table-column>
          <el-table-column :label="T('hits')" width="90" align="right">
            <template #default="{ row }"
              ><span class="memory-call-number">{{ row.hit_count ?? '—' }}</span></template
            >
          </el-table-column>
        </el-table>
      </div>
      <p class="memory-calls-footnote">{{ T('callsPrivacy') }}</p>
    </div>
  </section>
</template>
<script setup lang="ts">
  import { computed, onMounted } from 'vue'
  import { Clock, RefreshRight, Warning } from '@element-plus/icons-vue'
  import { MemoryManager as manager } from './manager'
  import { MemoryT as T } from './lang'
  import { displayDate } from './presentation'
  const rows = computed(() => [...(manager.callsResult?.data ?? [])].reverse())
  const format = (value: unknown) => JSON.stringify(value ?? {}, null, 2)
  const outcomeKeys: Record<string, string> = {
    success: 'callsSuccess',
    already_deleted: 'callsDeleted',
    deleted: 'callsDeleted',
    failed: 'callsFailed',
    partial: 'callsPartial',
    conflict: 'callsConflict',
    unknown: 'callsUnknown',
    busy: 'callsBusy',
    running: 'callsRunning'
  }
  const outcomeLabel = (outcome: string) =>
    outcomeKeys[outcome] ? T(outcomeKeys[outcome]) : T(outcome)
  onMounted(() => {
    void manager.loadCalls()
  })
</script>
<style scoped src="./calls.css"></style>
