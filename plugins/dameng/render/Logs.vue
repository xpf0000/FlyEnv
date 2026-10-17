<template>
  <div class="module-config">
    <el-card>
      <LogVM ref="log" :key="`${file}:${currentVersion?.run === true}`" :log-file="file" />
      <template #footer>
        <ToolVM :log="log" />
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { BrewStore } from '@/store/brew'
  import type { DamengInstalled } from './store'

  const log = ref()
  const currentVersion = computed(
    () => BrewStore().currentVersion('dameng') as DamengInstalled | undefined
  )
  const file = computed(() => {
    const version = currentVersion.value
    return version?.damengRuntime?.initialized ? version.damengRuntime.logFile : ''
  })
</script>
