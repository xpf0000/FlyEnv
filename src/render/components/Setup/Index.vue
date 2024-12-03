<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <li
        v-for="(item, index) in tabs"
        :key="index"
        :class="store.tab === item.value ? 'active' : ''"
        @click="store.tab = item.value"
        >{{ item.label }}</li
      >
    </ul>
    <div class="main-block">
      <Common v-if="store.tab === 'base'"></Common>
      <EditorConfig v-if="store.tab === 'editor'"></EditorConfig>
      <Licenses v-if="store.tab === 'licenses'" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import Common from './Common.vue'
  import EditorConfig from './EditorConfig/index.vue'
  import { I18nT } from '@shared/lang'
  import { SetupStore } from '@/components/Setup/store'
  import Licenses from './Licenses/index.vue'

  const store = SetupStore()

  const tabs = computed(() => {
    return [
      {
        value: 'base',
        label: I18nT('base.setupBase')
      },
      {
        value: 'editor',
        label: I18nT('base.editorSetup')
      },
      {
        value: 'licenses',
        label: I18nT('setup.Licenses')
      }
    ]
  })
</script>
