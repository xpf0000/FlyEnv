<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-logs">
      <ul class="top-tab">
        <li class="active">{{ customTitle }}</li>
      </ul>
      <LogVM ref="log" :log-file="filepath" />
      <ToolVM :log="log" />
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { AsyncComponentSetup } from '@web/fn'
  import LogVM from '@web/components/Log/index.vue'
  import ToolVM from '@web/components/Log/tool.vue'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    logFile?: string
    customTitle?: string
  }>()

  const filepath = ref('')
  const log = ref()

  filepath.value = props?.logFile ?? ''

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
