<template>
  <div class="module-config">
    <el-card>
      <template #header>
        <el-radio-group v-model="logType">
          <el-radio-button
            v-for="f in files"
            :key="f.path"
            :label="f.name"
            :value="f.path"
          ></el-radio-button>
        </el-radio-group>
      </template>
      <LogVM ref="log" :key="logType" :log-file="logType" />
      <template #footer>
        <ToolVM :log="log" />
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { join } from '@/util/path-browserify'
  import { BrewStore } from '@/store/brew'

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('temporal')
  })

  const log = ref()

  const files = computed(() => {
    const baseDir = join(window.Server.BaseDir!, 'temporal')
    const v = currentVersion?.value?.version?.trim()?.split(' ')?.join('') ?? ''
    const list = [
      { name: 'ui-out', path: join(baseDir, 'temporal-ui-start-out.log') },
      { name: 'ui-error', path: join(baseDir, 'temporal-ui-start-error.log') }
    ]
    if (v) {
      list.unshift(
        { name: 'server-out', path: join(baseDir, `temporal-${v}-start-out.log`) },
        { name: 'server-error', path: join(baseDir, `temporal-${v}-start-error.log`) }
      )
    }
    return list
  })

  const logType = ref('')

  watch(
    files,
    (list) => {
      if (!logType.value || !list.some((f) => f.path === logType.value)) {
        logType.value = list?.[0]?.path ?? ''
      }
    },
    { immediate: true }
  )
</script>
