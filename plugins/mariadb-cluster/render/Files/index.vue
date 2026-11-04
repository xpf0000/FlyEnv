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
          <span class="ml-3 title truncate">{{ title }}</span>
        </div>
      </div>
      <Config v-if="view === 'config'" :id="id" />
      <template v-else>
        <div class="main-wapper">
          <LogVM v-if="state.loaded" ref="log" :log-file="state.file" />
        </div>
        <ToolVM :log="log" />
      </template>
    </div>
  </el-drawer>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { MariadbClusterManager as manager } from '../manager'
  import { t } from '../lang'
  import { InstanceFiles as files } from './manager'
  import type { FileView } from './controller'
  import Config from './Config.vue'

  const props = defineProps<{ id: string; view: FileView }>()
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const log = ref()
  const state = computed(() => files.state(props.id, props.view))
  const instance = computed(() => manager.catalog.instances.find((row) => row.id === props.id))
  const title = computed(
    () =>
      `${props.view === 'config' ? 'my.cnf' : t(props.view)} - ${instance.value?.name ?? props.id} - ${state.value.file}`
  )
  if (props.view !== 'config') void files.load(props.id, props.view)
  defineExpose({ show, onClosed, onSubmit })
</script>
