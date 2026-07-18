<template>
  <el-config-provider :locale="locale">
    <el-container id="container" class="overflow-hidden h-screen">
      <Aside />
      <router-view />
      <el-drawer
        v-model="AppToolStore.floatShow"
        size="90%"
        :destroy-on-close="false"
        :with-header="false"
      >
        <ToolIndex />
      </el-drawer>
    </el-container>
  </el-config-provider>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import Aside from '@/components/Aside/Index.vue'
  import { RendererLanguage } from '@/core/LanguageService'
  import { AppToolStore } from '@/components/Tools/store'
  import ToolIndex from '@/components/Tools/Index.vue'

  const locale = computed(() => RendererLanguage.elementPlusLocale.value)
</script>
