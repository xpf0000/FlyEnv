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

  const props = defineProps<{
    type: 'out' | 'error'
  }>()

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('rustfs')
  })

  const log = ref()
  const filepath = computed(() => {
    if (!currentVersion?.value?.version) {
      return ''
    }
    return join(
      window.Server.BaseDir!,
      `rustfs/rustfs-${currentVersion.value.version}-start-${props.type}.log`
    )
  })
</script>
