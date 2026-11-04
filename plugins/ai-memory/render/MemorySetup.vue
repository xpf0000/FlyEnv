<template>
  <section class="memory-setup">
    <p>{{ T('setupHelp') }}</p>
    <div class="flex flex-wrap gap-2 my-3">
      <el-button @click="router.push('/mcp')">{{ T('mcpSettings') }}</el-button>
      <el-button
        v-for="client in clients"
        :key="client"
        :loading="manager.actions[`configure:${client}`]?.status === 'running'"
        @click="manager.configureClient(client)"
        >{{ T(client === 'codex' ? 'configureCodex' : 'configureKimi') }}</el-button
      >
    </div>
    <p
      v-for="client in clients"
      :key="`${client}-result`"
      :class="{ 'text-red-500': manager.actions[`configure:${client}`]?.result?.success === false }"
    >
      <template v-if="manager.actions[`configure:${client}`]?.result"
        >{{ client }}:
        {{
          manager.actions[`configure:${client}`].result?.success
            ? T('configured')
            : T('actionFailed')
        }}</template
      >
    </p>
    <h3>{{ T('rules') }}</h3
    ><p>{{ T('rulesHelp') }}</p>
    <div class="flex gap-2 my-3"
      ><el-button @click="manager.copyRules()">{{ T('copyRules') }}</el-button
      ><el-button @click="manager.downloadRules()">{{ T('downloadRules') }}</el-button></div
    >
    <p v-if="manager.actions['rules:copy']?.result">{{
      manager.actions['rules:copy'].result?.success ? T('copied') : T('actionFailed')
    }}</p>
    <p
      v-if="
        manager.actions['rules:download']?.result &&
        !manager.actions['rules:download'].result?.cancelled
      "
      >{{
        manager.actions['rules:download'].result?.success ? T('downloaded') : T('actionFailed')
      }}</p
    >
    <details
      ><summary>{{ T('rules') }}</summary
      ><pre class="whitespace-pre-wrap text-sm">{{ memoryRules() }}</pre>
    </details>
    <h3>{{ T('dataDirectory') }}</h3>
    <p class="break-all">{{ manager.runtimeResult?.data?.dataRoot }}</p>
    <p v-if="manager.runtimeResult?.error_code">{{ T(manager.runtimeResult.error_code) }}</p>
    <div class="flex gap-2 my-3"
      ><el-button @click="manager.openDataDirectory()">{{ T('openDirectory') }}</el-button
      ><el-button @click="manager.inspectRecovery()">{{ T('recovery') }}</el-button></div
    >
    <p v-if="manager.actions.directory?.result?.success === false">{{ T('actionFailed') }}</p>
    <p>{{ T('recoveryHelp') }}</p>
    <pre v-if="manager.recoveryResult" class="whitespace-pre-wrap text-sm">{{
      JSON.stringify(manager.recoveryResult, null, 2)
    }}</pre>
    <h3>{{ T('backup') }}</h3
    ><p>{{ T('backupHelp') }}</p
    ><p>{{ T('lifecycleHelp') }}</p> <h3>{{ T('diagnostics') }}</h3
    ><p>{{ T('diagnosticsHelp') }}</p>
    <el-button class="my-3" @click="manager.loadDiagnostics()">{{ T('refresh') }}</el-button>
    <p v-if="manager.diagnosticsResult?.error_code">{{
      T(manager.diagnosticsResult.error_code)
    }}</p>
    <pre v-if="manager.diagnosticsResult?.data" class="whitespace-pre-wrap text-sm">{{
      JSON.stringify(manager.diagnosticsResult.data, null, 2)
    }}</pre>
  </section>
</template>
<script setup lang="ts">
  import { onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { MemoryManager as manager, memoryRules } from './manager'
  import { MemoryT as T } from './lang'
  const clients = ['codex', 'kimi'] as const
  const router = useRouter()
  onMounted(() => {
    void manager.loadRuntime()
  })
</script>
<style scoped>
  .memory-setup {
    line-height: 1.7;
  }
  h3 {
    margin-top: 1.25rem;
    font-weight: 600;
  }
  pre {
    max-height: 24rem;
    overflow: auto;
    padding: 1rem;
    background: var(--el-fill-color-light);
  }
</style>
