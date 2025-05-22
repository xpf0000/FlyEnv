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
  import { TomcatSetup } from '@/components/Tomcat/setup'

  const { join } = require('path')
  const { existsSync } = require('fs')

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('tomcat')
  })

  const log = ref()
  const filepath = computed(() => {
    if (!currentVersion?.value) {
      return ''
    }

    let baseDir = ''

    if (currentVersion?.value?.bin) {
      if (TomcatSetup.CATALINA_BASE[currentVersion.value.bin]) {
        baseDir = TomcatSetup.CATALINA_BASE[currentVersion.value.bin]
      } else {
        const v = currentVersion?.value?.version?.split('.')?.shift() ?? ''
        baseDir = join(global.Server.BaseDir!, `tomcat/tomcat${v}`)
      }
    } else {
      return ''
    }
    let dir = join(baseDir, `logs/catalina.out`)
    if (existsSync(dir)) {
      return dir
    }
    const today = new Date()
    const formattedDate = today.toISOString().split('T')[0]
    dir = join(baseDir, `logs/catalina.${formattedDate}.log`)
    if (existsSync(dir)) {
      return dir
    }
    return ''
  })
</script>
