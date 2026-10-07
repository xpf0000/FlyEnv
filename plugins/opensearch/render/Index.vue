<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, index) in tabs" :key="index">
        <el-radio-button :label="item" :value="index" />
      </template>
    </el-radio-group>
    <div class="main-block">
      <Service v-if="tab === 0" type-flag="opensearch" title="OpenSearch">
        <template v-if="runningVersion" #tool-left>
          <el-tooltip
            :content="
              dashboardsPanel.opening
                ? dashboardsPanel.progressText || OpenSearchT('dashboardsOpening')
                : OpenSearchT('dashboards')
            "
            placement="top"
          >
            <el-button
              style="color: #01cc74"
              class="button"
              link
              :disabled="dashboardsPanel.opening"
              @click.stop="dashboardsPanel.open(runningVersion)"
            >
              <el-icon
                v-if="dashboardsPanel.opening"
                class="is-loading"
                style="width: 20px; height: 20px; margin-left: 10px"
              >
                <Loading />
              </el-icon>
              <yb-icon
                v-else
                style="width: 20px; height: 20px; margin-left: 10px"
                :svg="import('@/svg/http.svg?raw')"
              />
            </el-button>
          </el-tooltip>
        </template>
      </Service>
      <Manager
        v-else-if="tab === 1"
        type-flag="opensearch"
        title="OpenSearch"
        :has-static="!isMacOS"
        :show-brew-lib="true"
        :show-port-lib="false"
        url="https://opensearch.org/downloads/"
      />
      <Config v-else-if="tab === 2" />
      <Logs v-else-if="tab === 3" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { Loading } from '@element-plus/icons-vue'
  import { I18nT } from '@lang/index'
  import { AppModuleSetup } from '@/core/Module'
  import { BrewStore } from '@/store/brew'
  import Service from '@/components/ServiceManager/index.vue'
  import Manager from '@/components/VersionManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import dashboardsPanel from './DashboardsPanel'
  import { OpenSearchT } from './lang'

  const { tab, checkVersion } = AppModuleSetup('opensearch')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('base.configFile'),
    I18nT('base.log')
  ]

  const brewStore = BrewStore()
  const openSearchModule = brewStore.module('opensearch')
  const runningVersion = computed(() =>
    openSearchModule.installed.find((item) => {
      const pid = Number(item.pid)
      return (
        item.run &&
        !item.running &&
        !!item.version &&
        !!item.bin &&
        !!item.path &&
        Number.isSafeInteger(pid) &&
        pid > 0
      )
    })
  )
  if (!openSearchModule.installedFetched) {
    openSearchModule.fetchInstalled(true).catch()
  }

  // OpenSearch ships no official macOS builds; the static tab is hidden there.
  // LibUse is in-memory only, so a static selection can only linger within the
  // session (e.g. after a plugin update that flipped hasStatic).
  const isMacOS = computed(() => window.Server.isMacOS)
  if (isMacOS.value && brewStore.LibUse['opensearch'] === 'static') {
    brewStore.LibUse['opensearch'] = 'brew'
  }

  checkVersion()
</script>
