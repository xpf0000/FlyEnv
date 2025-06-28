<template>
  <div class="module-config">
    <el-card>
      <LogVM ref="log" :log-file="filepath" />
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
  import { join } from '@/util/path-browserify'
  import { BrewStore } from '@/store/brew'

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('meilisearch')
  })

  const log = ref()
  const filepath = computed(() => {
    if (!currentVersion?.value?.version) {
      return ''
    }
    return join(
      window.Server.BaseDir!,
      `meilisearch/meilisearch-${currentVersion.value.version}-start-error.log`
    )
  })
</script>
