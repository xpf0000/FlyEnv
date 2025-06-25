<template>
  <div class="module-config">
    <el-card>
      <LogVM ref="log" :log-file="file" />
      <template #footer>
        <ToolVM :log="log" />
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ComputedRef, ref } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { AppStore } from '@/store/app'
  import { BrewStore, SoftInstalled } from '@/store/brew'
  import { join } from '@/util/path-browserify'

  const log = ref()

  const appStore = AppStore()
  const brewStore = BrewStore()

  const version = computed(() => {
    const flag = 'elasticsearch'
    const server: any = appStore.config.server
    return server?.[flag]?.current
  })

  const currentVersion: ComputedRef<SoftInstalled | undefined> = computed(() => {
    return brewStore
      .module('elasticsearch')
      ?.installed?.find(
        (i) => i.path === version?.value?.path && i.version === version?.value?.version
      )
  })

  const file = computed(() => {
    if (currentVersion?.value?.path) {
      return join(currentVersion?.value?.path, 'logs/elasticsearch.log')
    }
    return ''
  })
</script>
