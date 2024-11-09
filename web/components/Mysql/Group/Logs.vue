<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="close">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15">{{ title }}</span>
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
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@web/fn'
  import type { MysqlGroupItem } from '@shared/app'
  import LogVM from '@web/components/Log/index.vue'
  import ToolVM from '@web/components/Log/tool.vue'

  const { join } = require('path')

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item: MysqlGroupItem
    flag: 'log' | 'slow-log'
  }>()

  const log = ref()

  const title = computed(() => {
    if (props.flag === 'log') {
      return I18nT('base.log')
    }
    return I18nT('base.slowLog')
  })

  const filepath = ref('')
  import('@web/config/mysql.log.txt?raw').then((res) => {
    filepath.value = res.default
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
