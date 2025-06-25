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
  import { ref, computed } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { join } from '@/util/path-browserify'
  import { BrewStore } from '@/store/brew'

  const props = defineProps<{
    type: 'out' | 'error'
  }>()

  const log = ref()

  const brew = BrewStore()

  const version = computed(() => {
    return brew.currentVersion('etcd')
  })

  const filepath = computed(() => {
    return join(
      window.Server.BaseDir!,
      `etcd/etcd-${version?.value?.version}-start-${props.type}.log`
    )
  })
  console.log('log filepath: ', filepath.value)
</script>
