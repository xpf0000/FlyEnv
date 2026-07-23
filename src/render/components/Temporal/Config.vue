<template>
  <div>
    <el-radio-group v-model="confType" class="mb-2 px-3">
      <el-radio-button label="server" value="server">Server</el-radio-button>
      <el-radio-button label="ui" value="ui">UI</el-radio-button>
    </el-radio-group>
    <Conf
      :key="file"
      ref="conf"
      :type-flag="'temporal'"
      :default-file="defaultFile"
      :file="file"
      :file-ext="'yaml'"
      :show-commond="false"
    >
    </Conf>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import IPC from '@/util/IPC'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'
  import { BrewStore } from '@/store/brew'

  const conf = ref()
  const confType = ref<'server' | 'ui'>('server')

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('temporal')
  })

  const file = computed(() => {
    const configDir = join(window.Server.BaseDir!, 'temporal', 'config')
    if (confType.value === 'ui') {
      return join(configDir, 'temporal-ui.yaml')
    }
    const v = currentVersion?.value?.version ?? ''
    if (!v) {
      return ''
    }
    return join(configDir, `temporal-v${v}.yaml`)
  })
  const defaultFile = computed(() => {
    return file.value ? `${file.value}.default` : ''
  })

  fs.existsSync(file.value).then((e) => {
    if (e) {
      return
    }
    if (confType.value === 'ui') {
      IPC.send('app-fork:temporal', 'initUiConfig').then((key: string) => {
        IPC.off(key)
        conf?.value?.update()
      })
    } else if (currentVersion.value) {
      IPC.send(
        'app-fork:temporal',
        'initConfig',
        JSON.parse(JSON.stringify(currentVersion.value))
      ).then((key: string) => {
        IPC.off(key)
        conf?.value?.update()
      })
    }
  })
</script>
