<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="store.tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item.label" :value="item.value"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Common v-if="store.tab === 'base'"></Common>
      <ModuleVM v-if="store.tab === 'module'" />
      <EditorConfig v-if="store.tab === 'editor'"></EditorConfig>
      <Licenses v-if="store.tab === 'licenses'" />
      <About v-if="store.tab === 'about'" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import Common from './Common.vue'
  import EditorConfig from './EditorConfig/index.vue'
  import { I18nT } from '@lang/index'
  import { SetupStore } from '@/components/Setup/store'
  import Licenses from './Licenses/index.vue'
  import About from './About/index.vue'
  import ModuleVM from './Module/index.vue'

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
        label: I18nT('base.editorSettings')
      },
      {
        value: 'licenses',
        label: I18nT('setup.Licenses')
      },
      {
        value: 'about',
        label: I18nT('base.about')
      }
    ]
  })
</script>
