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
      <div class="tool">
        <el-button class="shrink0" :disabled="log?.isDisabled()" @click="log?.logDo('open')">{{
          I18nT('base.open')
        }}</el-button>
        <el-button class="shrink0" :disabled="log?.isDisabled()" @click="log?.logDo('refresh')">{{
          I18nT('base.refresh')
        }}</el-button>
        <el-button class="shrink0" :disabled="log?.isDisabled()" @click="log?.logDo('clean')">{{
          I18nT('base.clean')
        }}</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import LogVM from '@/components/Log/index.vue'

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
