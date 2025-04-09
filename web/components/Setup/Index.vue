<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="store.tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item.label" :value="item.value"></el-radio-button>
      </template>
    </el-radio-group>
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
  import { SetupStore } from './store'
  import Licenses from './Licenses/index.vue'

  const store = SetupStore()

  const tabs = computed(() => {
    return [
      {
        value: 'base',
        label: I18nT('base.mainSettings')
      },
      {
        value: 'editor',
        label: I18nT('base.editorSettings')
      },
      {
        value: 'licenses',
        label: I18nT('setup.Licenses')
      }
    ]
  })
</script>
