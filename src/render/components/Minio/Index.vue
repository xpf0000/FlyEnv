<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="minio" title="Minio">
        <template #tool-left>
          <template v-if="isRunning">
            <el-button style="color: #01cc74" class="button" link @click.stop="openURL">
              <yb-icon
                style="width: 20px; height: 20px; margin-left: 10px"
                :svg="import('@/svg/http.svg?raw')"
              ></yb-icon>
            </el-button>
          </template>

          <div class="flex items-center gap-1 pl-4 pr-2">
            <span class="flex-shrink-0">{{ I18nT('util.mysqlDataDir') }}: </span>
            <span
              class="cursor-pointer hover:text-yellow-500 truncate"
              @click.stop="shell.openPath(DATA_DIR)"
              >{{ DATA_DIR }}</span
            >
            <el-button
              class="flex-shrink-0"
              :disabled="!DATA_DIR"
              link
              :icon="Edit"
              @click.stop="chooseDir"
            ></el-button>
          </div>
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="minio"
        title="Minio"
        :has-static="true"
        :show-port-lib="false"
        :show-brew-lib="true"
        url="https://github.com/minio/minio"
      >
      </Manager>
      <Config v-else-if="tab === 2"></Config>
      <LogVM v-else-if="tab === 3" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import Service from '../ServiceManager/index.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import { BrewStore } from '@/store/brew'
  import { chooseFolder } from '@/util/File'
  import { MinioSetup } from './setup'
  import { Edit } from '@element-plus/icons-vue'
  import Config from './Config.vue'
  import { join } from '@/util/path-browserify'
  import { shell, fs } from '@/util/NodeFn'
  import LogVM from './Logs.vue'

  const { tab, checkVersion } = AppModuleSetup('minio')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]
  checkVersion()

  const brewStore = BrewStore()

  const isRunning = computed(() => {
    return brewStore.module('minio').installed.some((m) => m.run)
  })

  const currentVersion = computed(() => {
    return brewStore.currentVersion('minio')
  })

  const DATA_DIR = computed({
    get() {
      if (currentVersion?.value?.bin) {
        if (MinioSetup.dir[currentVersion.value.bin]) {
          return MinioSetup.dir[currentVersion.value.bin]
        }
        return join(window.Server.BaseDir!, `minio/data`)
      }
      return I18nT('base.needSelectVersion')
    },
    set(v: string) {
      if (!currentVersion?.value?.bin) {
        return
      }
      MinioSetup.dir[currentVersion.value.bin] = v
      MinioSetup.save()
    }
  })

  const chooseDir = () => {
    chooseFolder()
      .then((path: string) => {
        DATA_DIR.value = path
      })
      .catch()
  }

  const openURL = async () => {
    const iniFile = join(window.Server.BaseDir!, 'minio/minio.conf')
    let port = '9000'
    const exists = await fs.existsSync(iniFile)
    if (exists) {
      const content = await fs.readFile(iniFile)
      const logStr = content.split('\n').find((s: string) => s.includes('MINIO_ADDRESS'))
      port =
        logStr?.trim()?.split('=')?.pop()?.split(':')?.pop()?.replace(`"`, '')?.replace(`'`, '') ??
        '9000'
    }
    const url = `http://127.0.0.1:${port}/`
    console.log('url: ', url)
    shell.openExternal(url).then().catch()
  }
</script>
