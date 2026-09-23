<template>
  <div class="soft-index-panel main-right-panel">
    <div class="mt-3 shrink-0 max-[960px]:pl-5">
      <div
        role="tablist"
        class="inline-flex items-center gap-0.5 rounded-lg border border-[var(--flyenv-light-border)] bg-[var(--flyenv-light-surface-muted)] p-1 shadow-[0_2px_8px_var(--flyenv-light-shadow)] dark:border-white/10 dark:bg-[var(--base-bg-color-1)] dark:shadow-none"
      >
        <button
          v-for="item in tabs"
          :key="item.value"
          type="button"
          role="tab"
          :aria-selected="store.tab === item.value"
          class="cursor-pointer h-7 rounded-lg border-0 bg-transparent px-3 py-1 text-xs transition-all active:scale-[0.98]"
          :class="
            store.tab === item.value
              ? '!bg-[var(--el-color-primary)] !text-white shadow-[0_2px_6px_var(--flyenv-light-primary-shadow)]'
              : 'text-[var(--el-text-color-primary)] opacity-60 hover:bg-[var(--el-color-primary-light-9)] hover:opacity-90'
          "
          @click="store.tab = item.value"
          >{{ item.label }}</button
        >
      </div>
    </div>
    <div class="main-block">
      <Common v-if="store.tab === 'base'"></Common>
      <ModuleVM v-else-if="store.tab === 'module'" />
      <Plugins v-else-if="store.tab === 'plugins'" />
      <UIConfig v-else-if="store.tab === 'editor'"></UIConfig>
      <Licenses v-else-if="store.tab === 'licenses'" />
      <About v-else-if="store.tab === 'about'" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import Common from './Common.vue'
  import UIConfig from './UIConfig/index.vue'
  import { I18nT } from '@lang/index'
  import { SetupStore } from '@/components/Setup/store'
  import Licenses from './Licenses/index.vue'
  import About from './About/index.vue'
  import ModuleVM from './Module/index.vue'
  import Plugins from './Plugins/index.vue'

  const store = SetupStore()

  const tabs = computed(() => {
    return [
      {
        value: 'base',
        label: I18nT('base.setupBase')
      },
      {
        value: 'module',
        label: I18nT('setup.moduleTitle')
      },
      {
        value: 'editor',
        label: 'UI'
      },
      {
        value: 'licenses',
        label: I18nT('setup.Licenses')
      },
      {
        value: 'about',
        label: I18nT('base.about')
      },
      {
        value: 'plugins',
        label: I18nT('setup.pluginsTitle')
      }
    ]
  })
</script>
