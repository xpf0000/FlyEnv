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
  import { join } from 'path-browserify'
  import { fs } from '@/util/NodeFn'
  import { asyncComputed } from '@vueuse/core'

  const props = defineProps<{
    item: ProjectItem
  }>()

  const packageJson = asyncComputed(async () => {
    const file = join(props.item.path, 'package.json')
    const exists = await fs.existsSync(file)
    if (exists) {
      const content = await fs.readFile(file)
      try {
        return JSON.parse(content)
      } catch {
        /* empty */
      }
    }
    return {}
  })

  const title = computed(() => {
    return join(props.item.path, 'package.json')
  })

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  defineExpose({ show, onClosed, onSubmit, closedFn })
</script>
