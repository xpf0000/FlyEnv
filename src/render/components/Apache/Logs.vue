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
    type: string
  }>()

  const brewStore = BrewStore()
  const version = computed(() => {
    return brewStore.currentVersion('apache')
  })

  const log = ref()
  const filepath = computed(() => {
    if (!version?.value || !version?.value?.bin) {
      return ''
    }
    if (window.Server.isWindows) {
      return join(window.Server.ApacheDir, `${version.value.version}.${props.type}.log`)
    }
    return join(window.Server.ApacheDir!, `common/logs/${props.type}_log`)
  })
</script>
