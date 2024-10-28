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
  import { computed, ref, watch } from 'vue'
  import LogVM from '@/components/Log/index.vue'
  import ToolVM from '@/components/Log/tool.vue'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'

  const { join } = require('path')
  const { existsSync, readFile } = require('fs-extra')

  const appStore = AppStore()
  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    const current = appStore.config.server?.rabbitmq?.current
    if (!current) {
      return undefined
    }
    const installed = brewStore.module('rabbitmq').installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const log = ref()
  const filepath = ref('')

  const findFile = async () => {
    const v = currentVersion?.value?.version?.split('.')?.[0] ?? ''
    if (!v) {
      filepath.value = ''
      return
    }
    const confFile = join(global.Server.BaseDir, 'rabbitmq', `rabbitmq-${v}.conf`)
    if (!existsSync(confFile)) {
      filepath.value = ''
      return
    }
    const logDir = join(global.Server.BaseDir, 'rabbitmq', `log-${v}`)
    const content = await readFile(confFile, 'utf-8')
    const name =
      content
        .split('\n')
        .find((s: string) => s.includes('NODENAME'))
        ?.split('=')
        ?.pop()
        ?.trim() ?? 'rabbit@localhost'
    filepath.value = join(logDir, `${name}.log`)
  }

  watch(
    currentVersion,
    (v) => {
      if (v && !filepath.value) {
        findFile().then().catch()
      }
    },
    {
      immediate: true
    }
  )
</script>
