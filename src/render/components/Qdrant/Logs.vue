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
  import { BrewStore } from '@/store/brew'
  import { join } from '@/util/path-browserify'

  const props = defineProps<{
    type: 'out' | 'error'
  }>()

  const log = ref()
  const brewStore = BrewStore()
  const currentVersion = computed(() => {
    return brewStore.currentVersion('qdrant')
  })
  const filepath = computed(() => {
    if (!currentVersion.value?.bin) {
      return ''
    }
    return join(
      window.Server.BaseDir!,
      `qdrant/qdrant-${currentVersion.value.version}-start-${props.type}.log`
    )
  })
</script>
