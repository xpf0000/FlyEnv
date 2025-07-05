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
  import { BrewStore } from '@/store/brew'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('rabbitmq')
  })

  const log = ref()
  const filepath = ref('')

  const findFile = async () => {
    const v = currentVersion?.value?.version?.split('.')?.[0] ?? ''
    if (!v) {
      filepath.value = ''
      return
    }
    let confFile = ''
    if (window.Server.isWindows) {
      confFile = join(window.Server.BaseDir!, 'rabbitmq', `rabbitmq-${v}.bat`)
    } else {
      confFile = join(window.Server.BaseDir!, 'rabbitmq', `rabbitmq-${v}.conf`)
    }
    if (!(await fs.existsSync(confFile))) {
      filepath.value = ''
      return
    }
    const logDir = join(window.Server.BaseDir!, 'rabbitmq', `log-${v}`)
    const content = await fs.readFile(confFile)
    const name =
      content
        .split('\n')
        .find((s: string) => s.includes('NODENAME'))
        ?.split('=')
        ?.pop()
        ?.replace('"', '')
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
