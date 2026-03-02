<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    :close-on-click-modal="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="close">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3">{{ I18nT('base.log') }}</span>
        </div>
      </div>
      <div class="main-wapper">
        <LogVM ref="log" :log-file="filepath" />
      </div>
      <ToolVM :log="log" />
    </div>
  </el-drawer>
</template>
<script lang="ts" setup>
  import { ref, computed } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { join } from '@/util/path-browserify'
  import { CloudflareTunnel } from '@/core/CloudflareTunnel/CloudflareTunnel'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: CloudflareTunnel
  }>()

  const log = ref()

  const filepath = computed(() => {
    return join(window.Server.BaseDir!, `cloudflare-tunnel/${props.item.id}-error.log`)
  })

  const close = () => {
    show.value = false
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
