<template>
  <el-scrollbar>
    <section v-if="section === 'connect'" class="memory-setup memory-settings">
      <h2>{{ T('connectAgent') }}</h2
      ><p class="memory-setting-help">{{ T('connectIntro') }}</p>
      <section class="memory-setting-section">
        <h3>{{ T('serviceStep') }}</h3>
        <div class="memory-setting-actions">
          <el-tag :type="ready ? 'success' : 'warning'">{{
            T(ready ? 'serviceReady' : manager.connection ? 'serviceNotReady' : 'notChecked')
          }}</el-tag>
          <el-button
            :loading="manager.actions.connection?.status === 'running'"
            @click="manager.loadConnection()"
            >{{ T('refreshStatus') }}</el-button
          >
          <el-button @click="router.push('/mcp')">{{ T('mcpSettings') }}</el-button>
        </div>
        <el-alert
          v-if="manager.actions.connection?.result?.success === false"
          :title="T('connectionFailed')"
          type="error"
          :closable="false"
        />
        <p v-if="manager.connection"
          >{{ T('mcpService') }}: {{ T(manager.connection.running ? 'started' : 'stopped') }} ·
          HTTP: {{ T(manager.connection.http ? 'enabled' : 'disabled') }} · {{ T('memoryTools') }}:
          {{ manager.connection.enabledCount }}/5</p
        >
        <p class="memory-setting-help">{{ T('setupHelp') }}</p>
      </section>
      <section class="memory-setting-section">
        <h3>{{ T('clientStep') }}</h3
        ><p class="memory-setting-help">{{ T('clientHelp') }}</p>
        <div v-for="client in clients" :key="client" class="memory-client-row">
          <strong>{{ client === 'codex' ? 'Codex' : 'Kimi' }}</strong>
          <el-button
            :disabled="!ready"
            :loading="manager.actions[`configure:${client}`]?.status === 'running'"
            @click="manager.configureClient(client)"
            >{{ T(client === 'codex' ? 'configureCodex' : 'configureKimi') }}</el-button
          >
          <span
            v-if="manager.actions[`configure:${client}`]?.result"
            :class="{ 'text-red-500': !manager.actions[`configure:${client}`].result?.success }"
            >{{
              T(
                manager.actions[`configure:${client}`].result?.success
                  ? 'configured'
                  : 'clientConfigFailed'
              )
            }}</span
          >
        </div>
      </section>
      <section class="memory-setting-section">
        <h3>{{ T('rulesStep') }}</h3
        ><p class="memory-setting-help">{{ T('rulesHelp') }}</p>
        <ol class="memory-instructions"
          ><li>{{ T('rulesAppend') }}</li
          ><li>{{ T('rulesRestart') }}</li></ol
        >
        <div class="memory-setting-actions"
          ><el-button @click="manager.copyRules()">{{ T('copyRules') }}</el-button
          ><el-button @click="manager.downloadRules()">{{ T('downloadRules') }}</el-button></div
        >
        <p v-if="manager.actions['rules:copy']?.result">{{
          T(manager.actions['rules:copy'].result?.success ? 'copied' : 'copyFailed')
        }}</p>
        <p
          v-if="
            manager.actions['rules:download']?.result &&
            !manager.actions['rules:download'].result?.cancelled
          "
          >{{
            T(manager.actions['rules:download'].result?.success ? 'downloaded' : 'downloadFailed')
          }}</p
        >
        <details
          ><summary>{{ T('previewRules') }}</summary
          ><pre class="memory-rules">{{ memoryRules() }}</pre>
        </details>
      </section>
      <section class="memory-setting-section">
        <h3>{{ T('verifyStep') }}</h3
        ><p class="memory-setting-help">{{ T('verificationHelp') }}</p>
        <blockquote class="memory-verification">{{ T('verificationPrompt') }}</blockquote>
        <el-button @click="manager.copyVerification()">{{ T('copyVerification') }}</el-button>
        <p v-if="manager.actions['verification:copy']?.result">{{
          T(manager.actions['verification:copy'].result?.success ? 'copied' : 'copyFailed')
        }}</p>
        <p class="memory-setting-help mt-3">{{ T('verificationResultHelp') }}</p>
      </section>
    </section>
    <section v-else class="memory-settings">
      <h2>{{ T('maintenance') }}</h2>
      <section class="memory-setting-section">
        <h3>{{ T('dataDirectory') }}</h3
        ><p class="memory-setting-help">{{ T('dataHelp') }}</p>
        <p v-if="manager.runtimeResult?.data" class="memory-data-path">{{
          manager.runtimeResult.data.dataRoot
        }}</p>
        <el-alert
          v-if="manager.runtimeResult?.error_code"
          :title="T(manager.runtimeResult.error_code)"
          type="error"
          :closable="false"
        />
        <el-button @click="manager.openDataDirectory()">{{ T('openDirectory') }}</el-button>
        <p v-if="manager.actions.directory?.result?.success === false" class="text-red-500">{{
          T('directory_unavailable')
        }}</p>
      </section>
      <section class="memory-setting-section">
        <h3>{{ T('diagnostics') }}</h3
        ><p class="memory-setting-help">{{ T('diagnosticsHelp') }}</p>
        <el-button class="mb-3" @click="manager.loadDiagnostics()">{{ T('refresh') }}</el-button>
        <el-alert
          v-if="manager.diagnosticsResult?.error_code"
          :title="T(manager.diagnosticsResult.error_code)"
          type="error"
          :closable="false"
        />
        <el-table
          v-if="manager.diagnosticsResult"
          :data="[...(manager.diagnosticsResult.data ?? [])].reverse()"
          :empty-text="T('noCalls')"
        >
          <el-table-column :label="T('time')" min-width="165"
            ><template #default="{ row }">{{ displayDate(row.time) }}</template></el-table-column
          >
          <el-table-column :label="T('operation')" min-width="120"
            ><template #default="{ row }">{{
              T(row.tool?.replace('flyenv_memory_', '') ?? 'unknown')
            }}</template></el-table-column
          >
          <el-table-column :label="T('client')" width="100"
            ><template #default="{ row }">{{ row.client?.name ?? '—' }}</template></el-table-column
          >
          <el-table-column :label="T('result')" min-width="140"
            ><template #default="{ row }"
              >{{ T(row.outcome) }}<p v-if="row.error_code">{{ T(row.error_code) }}</p></template
            ></el-table-column
          >
          <el-table-column :label="T('hits')" width="90"
            ><template #default="{ row }">{{ row.hit_count ?? '—' }}</template></el-table-column
          >
        </el-table>
      </section>
      <el-collapse>
        <el-collapse-item :title="T('backup')" name="backup"
          ><ol class="memory-instructions"
            ><li>{{ T('backupStop') }}</li
            ><li>{{ T('backupCopy') }}</li
            ><li>{{ T('backupRestore') }}</li></ol
          ><p class="memory-setting-help">{{ T('lifecycleHelp') }}</p></el-collapse-item
        >
        <el-collapse-item :title="T('recovery')" name="recovery">
          <p class="memory-setting-help">{{ T('recoveryHelp') }}</p
          ><el-button class="my-3" @click="manager.inspectRecovery()">{{
            T('recovery')
          }}</el-button>
          <el-alert
            v-if="manager.recoveryResult?.error_code"
            :title="T(manager.recoveryResult.error_code)"
            type="error"
            :closable="false"
          />
          <el-alert
            v-for="(warning, index) in manager.recoveryResult?.data?.warnings ?? []"
            :key="index"
            :title="T(warning.code)"
            type="warning"
            :closable="false"
            class="my-3"
          />
          <el-alert
            v-if="manager.recoveryResult?.data?.unmappedAfterPreviousRestore.length"
            :title="T('previousRestoreMissing')"
            type="warning"
            :closable="false"
            class="my-3"
            ><p v-for="id in manager.recoveryResult.data.unmappedAfterPreviousRestore" :key="id">{{
              id
            }}</p></el-alert
          >
          <el-descriptions v-if="manager.recoveryResult?.data" :column="1" border>
            <el-descriptions-item :label="T('primaryMapping')">{{
              T(
                manager.recoveryResult.data.primary.status === 'missing'
                  ? 'mappingMissing'
                  : manager.recoveryResult.data.primary.status
              )
            }}</el-descriptions-item>
            <el-descriptions-item :label="T('previousMapping')">{{
              T(
                manager.recoveryResult.data.previous.status === 'missing'
                  ? 'mappingMissing'
                  : manager.recoveryResult.data.previous.status
              )
            }}</el-descriptions-item>
            <el-descriptions-item :label="T('unmappedProjects')">{{
              recoverySummary(manager.recoveryResult.data).unmappedCount ?? T('notChecked')
            }}</el-descriptions-item>
          </el-descriptions>
          <details v-if="manager.recoveryResult?.data?.unmappedProjectIds.length" class="mt-3"
            ><summary>{{ T('technicalDetails') }}</summary
            ><p v-for="id in manager.recoveryResult.data.unmappedProjectIds" :key="id">{{
              id
            }}</p></details
          >
          <p class="memory-setting-help mt-3">{{ T('mappingRestoreHelp') }}</p>
        </el-collapse-item>
      </el-collapse>
    </section>
  </el-scrollbar>
</template>
<script setup lang="ts">
  import { computed, onMounted, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { MemoryManager as manager, memoryRules } from './manager'
  import { MemoryT as T } from './lang'
  import { displayDate, recoverySummary } from './presentation'
  const props = defineProps<{ section: 'connect' | 'maintenance' }>()
  const clients = ['codex', 'kimi'] as const
  const router = useRouter()
  const ready = computed(
    () =>
      manager.connection?.running &&
      manager.connection.http &&
      manager.connection.enabledCount === 5
  )
  function load() {
    if (props.section === 'connect') void manager.loadConnection()
    else {
      void manager.loadRuntime()
      void manager.loadDiagnostics()
    }
  }
  onMounted(load)
  watch(() => props.section, load)
</script>
<style scoped>
  .memory-settings {
    max-width: 960px;
    padding-right: 16px;
    line-height: 1.8;
  }
  h2 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 6px;
  }
  h3 {
    font-weight: 600;
    margin-bottom: 12px;
  }
  .memory-setting-help {
    color: var(--el-text-color-secondary);
  }
  .memory-setting-section {
    padding: 20px 0;
    border-bottom: 1px solid var(--el-border-color-light);
  }
  .memory-setting-actions,
  .memory-client-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin: 12px 0;
  }
  .memory-client-row strong {
    min-width: 65px;
  }
  .memory-data-path {
    overflow-wrap: anywhere;
    margin: 10px 0 16px;
    user-select: text;
  }
  .memory-instructions {
    list-style: decimal;
    padding-left: 22px;
    margin: 12px 0;
  }
  .memory-instructions li {
    margin: 8px 0;
  }
  summary {
    cursor: pointer;
    color: var(--el-color-primary);
    margin: 12px 0;
  }
  .memory-rules {
    white-space: pre-wrap;
    max-height: 360px;
    overflow: auto;
    padding: 16px;
    background: var(--el-fill-color-light);
  }
  .memory-verification {
    padding: 14px 18px;
    border-left: 3px solid var(--el-border-color);
    background: var(--el-fill-color-light);
    margin: 12px 0;
  }
</style>
