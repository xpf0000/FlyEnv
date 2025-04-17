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
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15 title truncate">{{ title }}</span>
        </div>
      </div>

      <div class="flex-1 overflow-hidden p-5">
        <el-scrollbar>
          <div class="flex flex-col gap-5">
            <ScriptVM :item="item" :package-json="packageJson" />
            <DependencieVM :item="item" />
          </div>
        </el-scrollbar>
      </div>
    </div>
  </el-drawer>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import type { ProjectItem } from '@/components/PHP/projects/setup'
  import ScriptVM from './scripts/index.vue'
  import DependencieVM from './dependencies/index.vue'

  const { join } = require('path')
  const { existsSync, readFileSync } = require('fs')

  const props = defineProps<{
    item: ProjectItem
  }>()

  const packageJson = computed(() => {
    const file = join(props.item.path, 'package.json')
    if (existsSync(file)) {
      const content = readFileSync(file, 'utf-8')
      try {
        return JSON.parse(content)
      } catch (e) {}
    }
    return {}
  })

  const title = computed(() => {
    return join(props.item.path, 'package.json')
  })

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  defineExpose({ show, onClosed, onSubmit, closedFn })
</script>
