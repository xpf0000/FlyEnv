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
  import { PostgreSqlSetup } from '@/components/PostgreSql/setup'

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('postgresql')
  })

  const log = ref()
  const filepath = computed(() => {
    if (!currentVersion?.value) {
      return ''
    }
    const version = currentVersion.value?.version
    const versionTop = version?.split('.')?.shift()
    const dir = join(window.Server.PostgreSqlDir!, `postgresql${versionTop}`)
    const dbPath = PostgreSqlSetup.dir?.[currentVersion.value.bin] ?? dir
    return join(dbPath, 'pg.log')
  })
</script>
