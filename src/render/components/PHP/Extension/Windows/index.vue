<template>
  <div class="flex flex-col gap-3 h-full">
    <el-alert :closable="false" type="info" :title="I18nT('php.windowsInstallHelp')" />
    <div v-if="entry.profile" class="text-sm break-all">
      <div class="font-semibold"
        >PHP {{ entry.profile.version }} · {{ entry.profile.architecture }} ·
        {{ entry.profile.build }}</div
      >
      <div>{{ entry.profile.bin }}</div>
      <div>php.ini: {{ entry.profile.ini }}</div>
    </div>
    <div class="flex gap-2">
      <el-input
        v-model="query"
        clearable
        :placeholder="I18nT('php.windowsSearchPlaceholder')"
        @keyup.enter="search"
      />
      <el-button :loading="entry.fetching" :disabled="entry.installing" @click="search">{{
        I18nT('php.windowsSearch')
      }}</el-button>
    </div>
    <el-alert
      v-if="entry.partial"
      type="warning"
      :closable="false"
      :title="I18nT('php.windowsPartialCatalog')"
    />
    <el-alert v-if="entry.error" type="error" :closable="false" :title="entry.error" />
    <el-alert
      v-if="entry.result"
      :type="entry.result.warning ? 'warning' : 'success'"
      :closable="false"
      :title="entry.result.warning || I18nT('php.windowsInstallSuccess')"
    >
      <div>{{ I18nT('php.windowsRestart') }}</div>
      <div class="break-all">{{ I18nT('php.windowsBackup') }}: {{ entry.result.backup }}</div>
    </el-alert>
    <pre
      v-if="entry.log"
      class="text-xs whitespace-pre-wrap break-all max-h-48 overflow-auto p-3 bg-black/5 dark:bg-white/5"
      >{{ entry.log }}</pre>
    <el-table
      v-if="entry.profile?.configured?.length"
      :data="entry.profile.configured"
      max-height="180"
      class="flex-shrink-0"
    >
      <el-table-column prop="name" :label="I18nT('php.extension')" />
      <el-table-column :label="I18nT('common.label.status')" align="center">
        <template #default="scope">
          <el-tag :type="scope.row.loaded ? 'success' : 'warning'">{{
            scope.row.loaded ? I18nT('common.state.enabled') : I18nT('php.windowsNotLoaded')
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column width="130" align="center">
        <template #default="scope">
          <el-button
            size="small"
            :disabled="!!windowsExtensions.installingBin || entry.fetching"
            @click="windowsExtensions.disable(version, scope.row.name)"
            >{{ I18nT('common.action.disable') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <el-table v-loading="entry.fetching" :data="entry.packages" height="100%" class="flex-1">
      <el-table-column prop="name" :label="I18nT('php.extension')" min-width="180" />
      <el-table-column
        prop="description"
        :label="I18nT('php.windowsDescription')"
        min-width="240"
      />
      <el-table-column width="130" align="center">
        <template #default="scope">
          <el-button
            type="primary"
            size="small"
            :disabled="!!windowsExtensions.installingBin || entry.fetching"
            @click="windowsExtensions.install(version, scope.row.name)"
            >{{ I18nT('php.windowsInstall') }}</el-button
          >
        </template>
      </el-table-column>
      <template #empty>{{ I18nT('php.windowsEmptyCatalog') }}</template>
    </el-table>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type { SoftInstalled } from '@shared/app'
  import { I18nT } from '@lang/index'
  import windowsExtensions from './controller'

  const props = defineProps<{ version: SoftInstalled }>()
  const entry = computed(() => windowsExtensions.entry(props.version))
  const query = ref(entry.value.lastQuery)
  const search = () => windowsExtensions.search(props.version, query.value)
  watch(
    () => props.version.bin,
    () => {
      query.value = entry.value.lastQuery
      windowsExtensions.load(props.version)
    },
    { immediate: true }
  )
</script>
