<template>
  <div class="module-config h-full overflow-hidden flex flex-col">
    <el-card class="app-base-el-card flex-1 overflow-hidden">
      <template #header>
        <el-radio-group v-model="confType">
          <el-radio-button label="server" value="server">Server</el-radio-button>
          <el-radio-button label="ui" value="ui">UI</el-radio-button>
        </el-radio-group>
      </template>
      <template #default>
        <ConfVM
          :key="file"
          ref="conf"
          class="h-full overflow-hidden"
          type-flag="temporal"
          :default-file="defaultFile"
          :file="file"
          file-ext="yaml"
          :show-commond="false"
        />
      </template>
      <template #footer>
        <ToolVM v-if="conf" :conf="conf" />
      </template>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, ref, watch } from 'vue'
  import ConfVM from '@/components/Conf/conf.vue'
  import ToolVM from '@/components/Conf/tool.vue'
  import IPC from '@/util/IPC'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'
  import { BrewStore } from '@/store/brew'

  const conf = ref()
  const confType = ref<'server' | 'ui'>('server')
  const brewStore = BrewStore()

  const currentVersion = computed(() => brewStore.currentVersion('temporal'))
  const file = computed(() => {
    const configDir = join(window.Server.BaseDir!, 'temporal', 'config')
    if (confType.value === 'ui') {
      return join(configDir, 'temporal-ui.yaml')
    }
    const version = currentVersion.value?.version ?? ''
    return version ? join(configDir, `temporal-v${version}.yaml`) : ''
  })
  const defaultFile = computed(() => (file.value ? `${file.value}.default` : ''))

  const invokeTemporal = (...args: any[]) => {
    return new Promise<any>((resolve) => {
      IPC.send('app-fork:temporal', ...args).then((key: string, res: any) => {
        IPC.off(key)
        resolve(res)
      })
    })
  }

  const ensureConfigFile = async () => {
    if (!file.value || (await fs.existsSync(file.value))) {
      return
    }
    let res: any
    if (confType.value === 'ui') {
      res = await invokeTemporal('initUiConfig')
    } else if (currentVersion.value) {
      res = await invokeTemporal('initConfig', JSON.parse(JSON.stringify(currentVersion.value)))
    } else {
      return
    }
    if (res?.code !== 0) {
      return
    }
    await nextTick()
    conf.value?.update()
  }

  watch(
    file,
    () => {
      ensureConfigFile().catch()
    },
    { immediate: true }
  )
</script>
