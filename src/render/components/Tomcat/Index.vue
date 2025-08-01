<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="tomcat" title="Tomcat">
        <template #tool-left>
          <div class="flex items-center gap-1 pl-4">
            <span class="flex-shrink-0">CATALINA_BASE: </span>
            <span
              class="cursor-pointer hover:text-yellow-500 truncate"
              @click.stop="shell.openPath(CATALINA_BASE)"
              >{{ CATALINA_BASE }}</span
            >
            <el-button
              class="flex-shrink-0"
              :disabled="!CATALINA_BASE"
              link
              :icon="Edit"
              @click.stop="chooseDir"
            ></el-button>
          </div>
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        title="Tomcat"
        type-flag="tomcat"
        :has-static="true"
        :show-port-lib="false"
        :show-brew-lib="true"
      ></Manager>
      <Config v-else-if="tab === 2" :file-name="'server.xml'"></Config>
      <Config v-else-if="tab === 3" :file-name="'web.xml'"></Config>
      <Logs v-else-if="tab === 4" type="access_log"></Logs>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'
  import { Edit } from '@element-plus/icons-vue'
  import { BrewStore } from '@/store/brew'
  import { TomcatSetup } from '@/components/Tomcat/setup'
  import { chooseFolder } from '@/util/File'
  import { join } from '@/util/path-browserify'
  import { shell } from '@/util/NodeFn'

  const { tab, checkVersion } = AppModuleSetup('tomcat')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    'server.xml',
    'web.xml',
    I18nT('base.log')
  ]
  checkVersion()

  const brewStore = BrewStore()

  const currentVersion = computed(() => {
    return brewStore.currentVersion('tomcat')
  })

  const CATALINA_BASE = computed({
    get() {
      if (currentVersion?.value?.bin) {
        if (TomcatSetup.CATALINA_BASE[currentVersion.value.bin]) {
          return TomcatSetup.CATALINA_BASE[currentVersion.value.bin]
        }
        const v = currentVersion?.value?.version?.split('.')?.shift() ?? ''
        return join(window.Server.BaseDir!, `tomcat/tomcat${v}`)
      }
      return I18nT('base.needSelectVersion')
    },
    set(v: string) {
      if (!currentVersion?.value?.bin) {
        return
      }
      TomcatSetup.CATALINA_BASE[currentVersion.value.bin] = v
      TomcatSetup.save()
    }
  })

  const chooseDir = () => {
    chooseFolder()
      .then((path: string) => {
        CATALINA_BASE.value = path
      })
      .catch()
  }
</script>
