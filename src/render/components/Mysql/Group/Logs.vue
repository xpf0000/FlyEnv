<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="close">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3">{{ title }}</span>
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
  import type { MysqlGroupItem } from '@shared/app'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { join } from '@/util/path-browserify'

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

  const filepath = computed(() => {
    const id = props.item.id
    if (props.flag === 'log') {
      return join(window.Server.MysqlDir!, `group/my-group-${id}-error.log`)
    }
    return join(window.Server.MysqlDir!, `group/my-group-${id}-slow.log`)
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
