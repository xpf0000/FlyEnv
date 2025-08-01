<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="postgresql" title="PostgreSQL">
        <template #tool-left>
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
        type-flag="postgresql"
        url="https://www.enterprisedb.com/downloads/postgres-postgresql-downloads"
        title="PostgreSQL"
      ></Manager>
      <Config v-else-if="tab === 2"></Config>
      <Logs v-else-if="tab === 3"></Logs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import { join } from '@/util/path-browserify'
  import { BrewStore } from '@/store/brew'
  import { computed } from 'vue'
  import { PostgreSqlSetup } from './setup'
  import { chooseFolder } from '@/util/File'
  import { Edit } from '@element-plus/icons-vue'
  import { shell } from '@/util/NodeFn'

  const { tab, checkVersion } = AppModuleSetup('nginx')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]
  checkVersion()

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('postgresql')
  })

  const DATA_DIR = computed({
    get() {
      if (currentVersion?.value?.bin) {
        if (PostgreSqlSetup.dir[currentVersion.value.bin]) {
          return PostgreSqlSetup.dir[currentVersion.value.bin]
        }
        const versionTop = currentVersion?.value?.version?.split('.')?.shift() ?? ''
        const dir = join(window.Server.PostgreSqlDir!, `postgresql${versionTop}`)
        return dir
      }
      return I18nT('base.needSelectVersion')
    },
    set(v: string) {
      if (!currentVersion?.value?.bin) {
        return
      }
      PostgreSqlSetup.dir[currentVersion.value.bin] = v
      PostgreSqlSetup.save()
    }
  })

  const chooseDir = () => {
    chooseFolder()
      .then((path: string) => {
        DATA_DIR.value = path
      })
      .catch()
  }
</script>
