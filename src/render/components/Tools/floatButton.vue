<template>
  <div v-if="!toolShow" class="app-ai-btn tool-btn" @click.stop="show">
    <yb-icon :svg="import('@/svg/tool.svg?raw')" width="26" height="26" />
  </div>
  <el-drawer
    v-model="toolShow"
    size="90%"
    :destroy-on-close="false"
    :with-header="false"
    append-to="#container"
    @open="onOpen"
  >
    <ToolIndex @on-tool-show="onToolShow" />
  </el-drawer>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import ToolIndex from './Index.vue'
  import { Setup } from '@/components/Tools/SystenEnv/setup'
  import { AppToolStore } from '@/components/Tools/store'

  const toolShow = ref(false)
  const show = () => {
    toolShow.value = true
  }
  const onToolShow = () => {
    toolShow.value = false
  }
  const onOpen = () => {
    if (AppToolStore.id === 'SystemEnv') {
      Setup.fetchList()
    }
  }
</script>
