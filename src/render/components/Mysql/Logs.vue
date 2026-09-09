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
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3 title truncate">{{ title }} - MySQL {{ version.version }}</span>
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
  import { computed, ref } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import type { SoftInstalled } from '@/store/brew'
  import { join } from '@/util/path-browserify'
  import IPC from '@/util/IPC'

  const props = defineProps<{
    type: string
    version: SoftInstalled
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const log = ref()
  const title = computed(() => (props.type === 'slow' ? I18nT('base.slowLog') : I18nT('base.log')))
  const versionKey = computed(
    () => props.version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
  )
  const filepath = ref(
    join(window.Server.MysqlDir ?? '', `mysql-${versionKey.value}-${props.type}.log`)
  )

  IPC.send('app-fork:mysql', 'getLogFiles', JSON.parse(JSON.stringify(props.version))).then(
    (key: string, res: any) => {
      IPC.off(key)
      const name = props.type === 'slow' ? 'slow' : 'error'
      const file = (res?.data ?? []).find(
        (item: { name: string; path: string }) => item.name === name
      )
      if (file?.path) {
        filepath.value = file.path
      }
    }
  )

  defineExpose({ show, onClosed, onSubmit })
</script>
