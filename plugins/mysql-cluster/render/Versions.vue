<template>
  <el-card class="version-manager">
    <template #header
      ><div class="card-header"
        ><div class="left"
          ><span>MySQL</span
          ><el-radio-group v-model="source" size="small"
            ><el-radio-button v-for="item in sources" :key="item" :value="item">{{
              item === 'Static' ? t('downloads') : item
            }}</el-radio-button></el-radio-group
          ></div
        ><el-button
          link
          :loading="!!manager.fetching[source]"
          :disabled="manager.busy"
          @click="manager.load(source, true)"
          >{{ t('refresh') }}</el-button
        ></div
      ></template
    >
    <el-alert
      v-if="unavailable"
      :title="t('packageManagerRequired')"
      type="info"
      :closable="false"
    />
    <el-alert
      v-if="manager.sourceErrors[source]"
      :title="manager.sourceErrors[source]"
      type="error"
      :closable="false"
    />
    <el-scrollbar class="flex-1 min-h-0">
      <el-table
        v-loading="!!manager.fetching[source]"
        :data="manager.versions[source] || []"
        show-overflow-tooltip
      >
        <el-table-column prop="name" :label="t('name')" min-width="220"
          ><template #default="{ row }"
            ><span class="cursor-pointer" @click="actions.copy(row.url || row.name)">{{
              row.name
            }}</span></template
          ></el-table-column
        >
        <el-table-column prop="version" :label="t('version')" width="130" />
        <el-table-column :label="t('state')" width="130"
          ><template #default="{ row }"
            ><el-tag v-if="row.installed" type="success" size="small">{{ t('installed') }}</el-tag
            ><span v-else>—</span></template
          ></el-table-column
        >
        <el-table-column :label="t('actions')" width="150" fixed="right" align="center"
          ><template #default="{ row }"
            ><el-tooltip
              :disabled="!row.conflictingFormula"
              :content="t('formulaConflict') + ' ' + row.conflictingFormula"
              ><el-button
                link
                type="primary"
                :disabled="manager.busy || unavailable || !!row.conflictingFormula"
                @click="manager.act(row)"
                >{{ t(row.installed ? 'uninstall' : 'install') }}</el-button
              ></el-tooltip
            ></template
          ></el-table-column
        >
      </el-table>
    </el-scrollbar>
    <el-progress
      v-if="manager.busy && manager.current?.source === 'Static'"
      :percentage="Math.min(100, Math.max(0, manager.progress))"
      class="mt-2"
    />
    <div
      v-show="manager.busy && manager.current?.source !== 'Static'"
      ref="terminalHost"
      class="min-h-[280px] mt-2"
    />
    <el-scrollbar v-if="!manager.busy && manager.output" max-height="220px">
      <pre class="whitespace-pre-wrap text-xs">{{ manager.output }}</pre>
    </el-scrollbar>
    <el-alert v-if="manager.error" :title="manager.error" type="error" :closable="false" />
    <el-alert v-if="manager.warning" :title="manager.warning" type="warning" :closable="false" />
    <template v-if="manager.busy && manager.current?.source !== 'Static'" #footer
      ><el-button @click="manager.cancel()">{{ t('cancel') }}</el-button></template
    >
  </el-card>
</template>
<script setup lang="ts">
  import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
  import {
    InstallationManager as manager,
    InstallationActionsManager as actions,
    attachInstallationTerminal
  } from './installations'
  import type { InstallationSource } from './installationsController'
  import { t } from './lang'
  const sources: InstallationSource[] = window.Server.isWindows
    ? ['Static']
    : window.Server.isMacOS
      ? ['Homebrew', 'Macports']
      : ['Homebrew']
  const source = ref<InstallationSource>(sources[0])
  const unavailable = computed(() =>
    source.value === 'Homebrew'
      ? !window.Server.BrewCellar
      : source.value === 'Macports'
        ? !window.Server.MacPorts
        : false
  )
  const terminalHost = ref<HTMLElement>()
  watch(source, (value) => manager.load(value), { immediate: true })
  watch(
    () => manager.busy,
    async () => {
      await nextTick()
      attachInstallationTerminal(terminalHost.value)
    }
  )
  onMounted(() => attachInstallationTerminal(terminalHost.value))
  onUnmounted(() => attachInstallationTerminal())
</script>
