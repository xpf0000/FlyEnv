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

  const log = ref()
  const brewStore = BrewStore()
  const version = computed(() => {
    return brewStore.currentVersion('n8n')
  })
  const filepath = computed(() => {
    return join(window.Server.BaseDir!, `n8n/n8n-${version?.value?.version}-start-out.log`)
  })
</script>
